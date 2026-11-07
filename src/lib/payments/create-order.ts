import type { PaymentType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getRazorpayClient } from '@/lib/razorpay'
import { PaymentResourceError, lockPaymentResource, resolvePaymentResource } from './resource'
import { createGatewayReceipt } from './receipts'

interface OrderInput {
  userId: string
  type: PaymentType
  bookingId?: string
  metadata?: unknown
  amountPaise?: number
  receiptPrefix?: 'pay' | 'prog' | 'store'
}

async function purchaseQuote(client: Prisma.TransactionClient, input: OrderInput) {
  await lockPaymentResource(client, input.type, input.bookingId, input.metadata)
  const resource = await resolvePaymentResource({ ...input, client, freezeQuote: true })
  if (input.amountPaise !== undefined && input.amountPaise !== resource.amountPaise) {
    throw new PaymentResourceError('Amount does not match resource price', 400)
  }
  const key = input.type === 'STORE' ? 'orderId' : 'enrollmentId'
  let resourceWhere: Prisma.PaymentWhereInput
  if (input.bookingId) resourceWhere = { bookingId: input.bookingId }
  else {
    const identity = resource.metadata[key]
    if (typeof identity !== 'string') throw new PaymentResourceError('Payment resource mismatch', 400)
    resourceWhere = { metadata: { path: [key], equals: identity } }
  }
  const pending = await client.payment.findFirst({
    where: {
      userId: input.userId, type: input.type, gateway: 'razorpay', currency: 'INR',
      amountPaise: resource.amountPaise, gatewayOrderId: { not: null },
      OR: [{ statusEnum: 'PENDING' }, { statusEnum: null, status: 'pending' }],
      ...resourceWhere,
    },
    orderBy: { createdAt: 'desc' },
  })
  return { resource, pending }
}

/** Shared owned-purchase quote and order writer; gateway I/O stays outside database transactions. */
export async function createPaymentOrder(input: OrderInput) {
  const quote = await prisma.$transaction(tx => purchaseQuote(tx, input), { maxWait: 10000, timeout: 10000 })
  const { resource } = quote
  if (quote.pending) {
    return { orderId: quote.pending.gatewayOrderId, amountPaise: resource.amountPaise, currency: 'INR', key: process.env.RAZORPAY_KEY_ID, paymentId: quote.pending.id }
  }
  const client = await getRazorpayClient()
  if (!client) throw new PaymentResourceError('Payment gateway unavailable', 500)
  const ensuredAmount = resource.amountPaise
  const notes = Object.fromEntries(Object.entries(resource.metadata).filter((entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number'))
  const order: { id: string } = await client.orders.create({
    amount: ensuredAmount, currency: 'INR', receipt: createGatewayReceipt(input.receiptPrefix ?? 'pay'), notes,
  })
  if (typeof order.id !== 'string' || !order.id) throw new Error('Gateway order was not confirmed')

  // Recheck after gateway I/O so concurrent checkout or fulfillment cannot be overwritten.
  const payment = await prisma.$transaction(async tx => {
    const current = await purchaseQuote(tx, input)
    if (current.pending) return current.pending
    if (current.resource.amountPaise !== ensuredAmount) throw new PaymentResourceError('Purchase price changed; request a new order', 409)
    const data = {
      userId: input.userId, type: resource.type, statusEnum: 'PENDING' as const, status: 'pending',
      amountPaise: ensuredAmount, currency: 'INR', gateway: 'razorpay', gatewayOrderId: order.id, metadata: resource.metadata,
    }
    if (input.bookingId) return tx.payment.upsert({
      where: { bookingId: input.bookingId },
      update: { ...data, gatewayPaymentId: null, gatewaySignature: null },
      create: { ...data, bookingId: input.bookingId },
    })
    return tx.payment.create({ data })
  }, { maxWait: 10000, timeout: 10000 })
  console.log('[payments][create-order][success]', { paymentId: payment.id, bookingId: input.bookingId || null, type: payment.type, amountPaise: ensuredAmount, orderId: payment.gatewayOrderId })
  return { orderId: payment.gatewayOrderId, amountPaise: ensuredAmount, currency: 'INR', key: process.env.RAZORPAY_KEY_ID, paymentId: payment.id }
}
