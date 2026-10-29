import { prisma } from '@/lib/prisma'
import type { Payment, Prisma } from '@prisma/client'
import { PaymentResourceError } from './resource'

interface ActivateArgs {
  paymentId?: string
  orderId?: string
  client?: Prisma.TransactionClient
  payment?: Payment
}

export interface StoreActivationResult {
  found: boolean
  isStore: boolean
  hasOrderId: boolean
  activated: boolean
  idempotent: boolean
  orderId?: string
  paymentId?: string
  reason?: string
}

async function activate(args: ActivateArgs, client: Prisma.TransactionClient): Promise<StoreActivationResult> {
  const orClauses: { gatewayPaymentId?: string; gatewayOrderId?: string }[] = []
  if (args.paymentId) orClauses.push({ gatewayPaymentId: args.paymentId })
  if (args.orderId) orClauses.push({ gatewayOrderId: args.orderId })
  if (!orClauses.length) {
    return { found: false, isStore: false, hasOrderId: false, activated: false, idempotent: false, reason: 'no_identifiers' }
  }

  const payment = args.payment ?? await client.payment.findFirst({ where: { OR: orClauses } })
  if (!payment) {
    return { found: false, isStore: false, hasOrderId: false, activated: false, idempotent: false, reason: 'payment_not_found', paymentId: args.paymentId, orderId: args.orderId }
  }

  if (payment.type !== 'STORE') {
    return { found: true, isStore: false, hasOrderId: false, activated: false, idempotent: false, reason: 'not_store', paymentId: payment.id }
  }

  if (payment.statusEnum !== 'SUCCESS' && payment.status !== 'success') {
    return { found: true, isStore: true, hasOrderId: false, activated: false, idempotent: false, reason: 'payment_not_successful' }
  }
  const meta = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata) ? payment.metadata : {}
  const storeOrderId = typeof meta.orderId === 'string' ? meta.orderId : undefined
  if (!storeOrderId) {
    console.warn('[store][activation][missing_orderId]', { paymentId: payment.id })
    return { found: true, isStore: true, hasOrderId: false, activated: false, idempotent: false, reason: 'missing_orderId', paymentId: payment.id }
  }

  const order = await client.order.findUnique({ where: { id: storeOrderId } })
  if (!order) {
    console.warn('[store][activation][order_not_found]', { storeOrderId, paymentId: payment.id })
    return { found: true, isStore: true, hasOrderId: true, activated: false, idempotent: false, reason: 'order_not_found', orderId: storeOrderId, paymentId: payment.id }
  }

  if (order.status === 'paid' || order.status === 'shipped' || order.status === 'delivered') {
    return { found: true, isStore: true, hasOrderId: true, activated: false, idempotent: true, orderId: storeOrderId, paymentId: payment.id }
  }

  if (order.status !== 'pending_payment') {
    return { found: true, isStore: true, hasOrderId: true, activated: false, idempotent: false, reason: 'unexpected_status', orderId: storeOrderId, paymentId: payment.id }
  }

  // Decrement stock counts and auto-disable sold-out products
  const orderItems = await client.orderItem.findMany({
    where: { orderId: storeOrderId },
    select: { productId: true, quantity: true },
  })
  const quantities = new Map<string, number>()
  for (const item of orderItems) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new PaymentResourceError('Invalid order quantity', 409)
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
  }
  // Consistent product ordering avoids deadlocks between multi-item orders.
  for (const [productId, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
    const product = await client.product.findUnique({
      where: { id: productId },
      select: { stockCount: true, stockStatus: true, isActive: true },
    })
    if (!product || !product.isActive || product.stockStatus === 'OUT') {
      throw new PaymentResourceError('Order stock is unavailable', 409)
    }
    if (product.stockCount !== null) {
      const decremented = await client.product.updateMany({
        where: { id: productId, stockCount: { gte: quantity } },
        data: { stockCount: { decrement: quantity } },
      })
      if (decremented.count !== 1) throw new PaymentResourceError('Order stock is unavailable', 409)
      const remaining = await client.product.findUniqueOrThrow({ where: { id: productId }, select: { stockCount: true } })
      const count = remaining.stockCount!
      await client.product.update({
        where: { id: productId },
        data: { stockStatus: count === 0 ? 'OUT' : count <= 5 ? 'LOW' : 'IN_STOCK' },
      })
    }
  }

  await client.order.update({ where: { id: storeOrderId }, data: { status: 'paid', paymentId: payment.id } })

  console.log('[store][activation][activated]', { orderId: storeOrderId, paymentId: payment.id })
  return { found: true, isStore: true, hasOrderId: true, activated: true, idempotent: false, orderId: storeOrderId, paymentId: payment.id }
}

/** Atomically update the order and its counted inventory with payment success. */
export function activateStoreOrder(args: ActivateArgs): Promise<StoreActivationResult> {
  return args.client ? activate(args, args.client) : prisma.$transaction(tx => activate(args, tx))
}
