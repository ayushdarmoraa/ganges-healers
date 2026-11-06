import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { lockTransaction } from '@/lib/db/locks'
import { lockPaymentResource } from '@/lib/payments/resource'
import { prisma } from '@/lib/prisma'
import { parcelFields, readOrderTracking, staffShippingAddressSchema } from './order-shipping'

export class StoreFulfillmentError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) {
    super(message)
    this.name = 'StoreFulfillmentError'
  }
}

const orderReference = z.object({
  id: z.string().min(1).max(200),
  version: z.string().regex(/^[a-f0-9]{64}$/),
})
export const orderFulfillmentSchema = z.discriminatedUnion('action', [
  orderReference.extend({ action: z.literal('ship'), ...parcelFields, address: staffShippingAddressSchema.optional() }).strict(),
  orderReference.extend({ action: z.literal('deliver') }).strict(),
])

const versionFields = { id: true, status: true, totalPaise: true, paymentId: true, updatedAt: true, shippingAddress: true, trackingInfo: true } as const
type ReviewedOrder = Prisma.OrderGetPayload<{ select: typeof versionFields }>

/** Bind the staff action to the order and the shipping/payment state displayed for review. */
export function orderFulfillmentVersion(order: ReviewedOrder) {
  return createHash('sha256').update(JSON.stringify([
    order.id, order.status, order.totalPaise, order.paymentId, order.updatedAt.toISOString(), order.shippingAddress, order.trackingInfo,
  ])).digest('hex')
}

function paymentUnavailable() {
  return new StoreFulfillmentError('A matching captured store payment is required before shipping. Review the payment record.', 409, 'PAYMENT_UNAVAILABLE')
}

async function requireShippingPayment(tx: Prisma.TransactionClient, order: ReviewedOrder & { userId: string }) {
  if (!order.paymentId) throw paymentUnavailable()
  await lockTransaction(tx, 'payment', `refund:${order.paymentId}`)
  await tx.$queryRaw`SELECT "id" FROM "Payment" WHERE "id" = ${order.paymentId} FOR SHARE`
  const payment = await tx.payment.findUnique({
    where: { id: order.paymentId },
    select: {
      userId: true, type: true, currency: true, amountPaise: true, status: true, statusEnum: true,
      gatewayPaymentId: true, metadata: true,
      refunds: { where: { OR: [{ status: null }, { status: { not: 'failed', mode: 'insensitive' } }] }, select: { id: true }, take: 1 },
    },
  })
  const metadata = payment?.metadata
  const boundOrder = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata.orderId : undefined
  if (!payment || payment.type !== 'STORE' || payment.userId !== order.userId || !payment.gatewayPaymentId
    || payment.amountPaise !== order.totalPaise || payment.amountPaise <= 0 || payment.currency !== 'INR'
    || (payment.statusEnum ?? payment.status.toUpperCase()) !== 'SUCCESS'
    || payment.status.toLowerCase() === 'refunded' || (boundOrder !== undefined && boundOrder !== order.id)) {
    throw paymentUnavailable()
  }
  if (payment.refunds.length) throw new StoreFulfillmentError('Review the refund on this payment before shipping.', 409, 'REFUND_REVIEW')
}

/** Record a manual shipment or delivery atomically with its private audit entry. */
export async function recordOrderFulfillment(actorId: string, input: z.infer<typeof orderFulfillmentSchema>) {
  return prisma.$transaction(async tx => {
    const [actor] = await tx.$queryRaw<Array<{ role: string; closedAt: Date | null }>>`
      SELECT "role", "closedAt" FROM "User" WHERE "id" = ${actorId} FOR SHARE
    `
    if (actor?.role !== 'ADMIN' || actor.closedAt) {
      throw new StoreFulfillmentError('Administrator access is required.', 403, 'FORBIDDEN')
    }
    await lockPaymentResource(tx, 'STORE', null, { orderId: input.id })
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.id} FOR UPDATE`
    const order = await tx.order.findUnique({
      where: { id: input.id },
      select: { ...versionFields, userId: true },
    })
    if (!order) throw new StoreFulfillmentError('Order not found.', 404, 'ORDER_NOT_FOUND')

    const shipping = input.action === 'ship'
    const expected = shipping ? 'paid' : 'shipped'
    const status = shipping ? 'shipped' : 'delivered'
    if (order.status !== expected || orderFulfillmentVersion(order) !== input.version) {
      throw new StoreFulfillmentError('This order changed. Reload it and review its current status.', 409, 'ORDER_CHANGED')
    }

    const now = new Date().toISOString()
    let data: Prisma.OrderUpdateInput
    if (shipping) {
      const savedAddress = staffShippingAddressSchema.safeParse(order.shippingAddress)
      if (!savedAddress.success && !input.address) {
        throw new StoreFulfillmentError('Enter a complete shipping address before recording shipment.', 409, 'ADDRESS_REQUIRED')
      }
      await requireShippingPayment(tx, order)
      data = {
        status,
        trackingInfo: { shipment: { carrier: input.carrier, trackingNumber: input.trackingNumber, shippedAt: now } },
        ...(!savedAddress.success && input.address ? { shippingAddress: input.address } : {}),
      }
    } else {
      const tracking = readOrderTracking(order.status, order.trackingInfo)
      data = { status, trackingInfo: { ...tracking, deliveredAt: now } }
    }

    await tx.order.update({ where: { id: order.id }, data })
    await tx.activityLog.create({ data: {
      userId: actorId, action: shipping ? 'store_order_shipped' : 'store_order_delivered',
      entityType: 'order', entityId: order.id, metadata: { from: expected, to: status },
    } })
    return { id: order.id, status }
  }, { maxWait: 10000, timeout: 10000 })
}
