import type { PaymentType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'

export class PaymentResourceError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'PaymentResourceError'
  }
}

interface ResourceInput {
  userId: string
  type: PaymentType
  bookingId?: string | null
  metadata?: unknown
  // A verified replay still checks ownership, but must not reprice a past purchase.
  settled?: boolean
  client?: Prisma.TransactionClient
  freezeQuote?: boolean
}

interface PaymentResource {
  type: PaymentType
  amountPaise: number
  metadata: Prisma.InputJsonObject
  requiresFulfillment: boolean
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

function resourceId(metadata: Record<string, unknown>, key: string): string {
  const id = metadata[key]
  if (typeof id !== 'string' || !id.trim()) {
    throw new PaymentResourceError(`metadata.${key} is required`, 400)
  }
  return id
}

function assertOwner(ownerId: string, userId: string) {
  if (ownerId !== userId) throw new PaymentResourceError('Forbidden', 403)
}

function assertBinding(metadata: Record<string, unknown>, key: string, expected: string | null) {
  if (metadata[key] !== undefined && metadata[key] !== expected) {
    throw new PaymentResourceError('Payment resource mismatch', 400)
  }
}

function pricedResource(type: PaymentType, amountPaise: number, metadata: Prisma.InputJsonObject, requiresFulfillment: boolean): PaymentResource {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new PaymentResourceError('Resource has no payable price', 409)
  }
  return { type, amountPaise, metadata, requiresFulfillment }
}

/** Stable purchase identity shared by quote creation and payment finalization locks. */
export function paymentResourceKey(type: PaymentType, bookingId?: string | null, value?: unknown): string {
  const metadata = metadataObject(value)
  if (type === 'SESSION' && bookingId) return `SESSION:${bookingId}`
  if (type === 'PROGRAM' || type === 'COURSE') return `${type}:${resourceId(metadata, 'enrollmentId')}`
  if (type === 'STORE') return `STORE:${resourceId(metadata, 'orderId')}`
  throw new PaymentResourceError('A supported purchase resource is required', 400)
}

/** Keep booking/payment writers in the same healer-then-purchase lock order. */
export async function lockPaymentResource(client: Prisma.TransactionClient, type: PaymentType, bookingId?: string | null, metadata?: unknown) {
  if (type === 'SESSION' && bookingId) {
    const booking = await client.booking.findUnique({ where: { id: bookingId }, select: { healerId: true } })
    if (booking) await lockTransaction(client, 'healer', booking.healerId)
  }
  await lockTransaction(client, 'payment', paymentResourceKey(type, bookingId, metadata))
}

/** Resolve the owned purchase and rebuild fulfillment metadata from database records. */
export async function resolvePaymentResource(input: ResourceInput): Promise<PaymentResource> {
  const { userId, type, bookingId, settled = false, client = prisma, freezeQuote = false } = input
  const metadata = metadataObject(input.metadata)
  if (bookingId && type !== 'SESSION') throw new PaymentResourceError('Payment resource mismatch', 400)

  if (type === 'SESSION') {
    if (!bookingId) throw new PaymentResourceError('SESSION payments require bookingId', 400)
    const booking = await client.booking.findUnique({ where: { id: bookingId }, include: { payment: true } })
    if (!booking) throw new PaymentResourceError('Booking not found', 404)
    assertOwner(booking.userId, userId)
    if (!settled && (booking.status === 'CANCELLED' || booking.status === 'COMPLETED'
      || booking.payment?.statusEnum === 'SUCCESS' || booking.payment?.status === 'success')) {
      throw new PaymentResourceError('Booking is not awaiting payment', 409)
    }
    return pricedResource(type, booking.pricePaise, { bookingId }, ['PENDING', 'SCHEDULED', 'RESCHEDULED'].includes(booking.status))
  }

  if (type === 'PROGRAM') {
    const enrollmentId = resourceId(metadata, 'enrollmentId')
    const enrollment = await client.programEnrollment.findUnique({ where: { id: enrollmentId }, include: { program: true } })
    if (!enrollment) throw new PaymentResourceError('Enrollment not found', 404)
    assertOwner(enrollment.userId, userId)
    assertBinding(metadata, 'programId', enrollment.programId)
    assertBinding(metadata, 'healerId', enrollment.healerId)
    if (!settled && (enrollment.status !== 'pending_payment' || !enrollment.program.isActive)) {
      throw new PaymentResourceError('Enrollment is not awaiting payment', 409)
    }
    const amount = enrollment.pricePaise ?? enrollment.program.pricePaise
    const resource = pricedResource(type, amount, {
      enrollmentId, programId: enrollment.programId, healerId: enrollment.healerId,
    }, enrollment.status === 'pending_payment')
    if (freezeQuote && enrollment.pricePaise == null) {
      await client.programEnrollment.update({ where: { id: enrollmentId }, data: { pricePaise: amount } })
    }
    return resource
  }

  if (type === 'COURSE') {
    const enrollmentId = resourceId(metadata, 'enrollmentId')
    const enrollment = await client.courseEnrollment.findUnique({ where: { id: enrollmentId }, include: { course: true } })
    if (!enrollment) throw new PaymentResourceError('Enrollment not found', 404)
    assertOwner(enrollment.userId, userId)
    assertBinding(metadata, 'courseId', enrollment.courseId)
    if (!settled && (enrollment.status !== 'pending_payment' || !enrollment.course.isActive)) {
      throw new PaymentResourceError('Enrollment is not awaiting payment', 409)
    }
    const amount = enrollment.pricePaise ?? enrollment.course.pricePaise
    const resource = pricedResource(type, amount, { enrollmentId, courseId: enrollment.courseId }, enrollment.status === 'pending_payment')
    if (freezeQuote && enrollment.pricePaise == null) {
      await client.courseEnrollment.update({ where: { id: enrollmentId }, data: { pricePaise: amount } })
    }
    return resource
  }

  if (type === 'STORE') {
    const orderId = resourceId(metadata, 'orderId')
    const order = await client.order.findUnique({ where: { id: orderId } })
    if (!order) throw new PaymentResourceError('Order not found', 404)
    assertOwner(order.userId, userId)
    if (!settled && order.status !== 'pending_payment') {
      throw new PaymentResourceError('Order is not awaiting payment', 409)
    }
    return pricedResource(type, order.totalPaise, { orderId }, order.status === 'pending_payment')
  }

  throw new PaymentResourceError('Use the membership subscription endpoint', 400)
}
