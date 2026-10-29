import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { PaymentType, Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRazorpayClient } from '@/lib/razorpay'
import { PaymentResourceError, lockPaymentResource, resolvePaymentResource } from '@/lib/payments/resource'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BodySchema = z.object({
  amountPaise: z.number().int().positive().optional(),
  bookingId: z.string().cuid().optional(),
  type: z.enum(['SESSION','PROGRAM','MEMBERSHIP','STORE','COURSE']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

async function purchaseQuote(client: Prisma.TransactionClient, input: { userId: string; type: PaymentType; bookingId?: string; metadata?: unknown; amountPaise?: number }) {
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

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    }
    const { amountPaise, bookingId, type, metadata } = parsed.data

    // Enforce mutual exclusivity: either bookingId OR type (generic). Not both.
    if ((bookingId && type) || (!bookingId && !type)) {
      return NextResponse.json({ error: 'Provide either bookingId OR type (generic payment), exclusively.' }, { status: 400 })
    }

    const input = { userId: session.user.id, type: bookingId ? 'SESSION' as const : type!, bookingId, metadata, amountPaise }
    const quote = await prisma.$transaction(tx => purchaseQuote(tx, input), { maxWait: 10000, timeout: 10000 })
    const { resource } = quote
    if (quote.pending) {
      return NextResponse.json({ orderId: quote.pending.gatewayOrderId, amountPaise: resource.amountPaise, currency: 'INR', key: process.env.RAZORPAY_KEY_ID, paymentId: quote.pending.id })
    }

    const client = await getRazorpayClient()
    if (!client) return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })

    const ensuredAmount = resource.amountPaise
    const order = await client.orders.create({
      amount: ensuredAmount,
      currency: 'INR',
      receipt: `pay_${Date.now()}`,
      notes: resource.metadata,
    })

    // Gateway I/O stays outside the DB transaction. Recheck after it completes so
    // a concurrent callback or quote request cannot be overwritten.
    const paymentRecord = await prisma.$transaction(async tx => {
      const current = await purchaseQuote(tx, input)
      if (current.pending) return current.pending
      if (current.resource.amountPaise !== ensuredAmount) throw new PaymentResourceError('Purchase price changed; request a new order', 409)
      if (bookingId) {
        return tx.payment.upsert({
          where: { bookingId },
          update: {
            type: resource.type,
            userId: session.user.id,
            statusEnum: 'PENDING',
            status: 'pending',
            amountPaise: ensuredAmount,
            currency: 'INR',
            gateway: 'razorpay',
            gatewayOrderId: order.id,
            gatewayPaymentId: null,
            gatewaySignature: null,
            metadata: resource.metadata,
          },
          create: {
            bookingId,
            userId: session.user.id,
            type: resource.type,
            statusEnum: 'PENDING',
            status: 'pending',
            amountPaise: ensuredAmount,
            currency: 'INR',
            gateway: 'razorpay',
            gatewayOrderId: order.id,
            metadata: resource.metadata,
          }
        })
      } else {
        return tx.payment.create({
          data: {
            userId: session.user.id,
            type: resource.type,
            statusEnum: 'PENDING',
            status: 'pending',
            amountPaise: ensuredAmount,
            currency: 'INR',
            gateway: 'razorpay',
            gatewayOrderId: order.id,
            metadata: resource.metadata,
          }
        })
      }
    }, { maxWait: 10000, timeout: 10000 })

    console.log('[payments][create-order][success]', { paymentId: paymentRecord.id, bookingId: bookingId || null, type: paymentRecord.type, amountPaise: ensuredAmount, orderId: paymentRecord.gatewayOrderId })
    return NextResponse.json({
      orderId: paymentRecord.gatewayOrderId,
      amountPaise: ensuredAmount,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID,
      paymentId: paymentRecord.id,
    })
  } catch (err) {
    if (err instanceof PaymentResourceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[payments][create-order][error]', err)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
