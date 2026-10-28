import type { PaymentType, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

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
}

interface PaymentResource {
  type: PaymentType
  amountPaise: number
  metadata: Prisma.InputJsonObject
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

function pricedResource(type: PaymentType, amountPaise: number, metadata: Prisma.InputJsonObject): PaymentResource {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new PaymentResourceError('Resource has no payable price', 409)
  }
  return { type, amountPaise, metadata }
}

/** Resolve the owned purchase and rebuild fulfillment metadata from database records. */
export async function resolvePaymentResource(input: ResourceInput): Promise<PaymentResource> {
  const { userId, type, bookingId, settled = false } = input
  const metadata = metadataObject(input.metadata)
  if (bookingId && type !== 'SESSION') throw new PaymentResourceError('Payment resource mismatch', 400)

  if (type === 'SESSION') {
    if (!bookingId) throw new PaymentResourceError('SESSION payments require bookingId', 400)
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { payment: true } })
    if (!booking) throw new PaymentResourceError('Booking not found', 404)
    assertOwner(booking.userId, userId)
    if (!settled && (booking.status === 'CANCELLED' || booking.status === 'COMPLETED'
      || booking.payment?.statusEnum === 'SUCCESS' || booking.payment?.status === 'success')) {
      throw new PaymentResourceError('Booking is not awaiting payment', 409)
    }
    return pricedResource(type, booking.pricePaise, { bookingId })
  }

  if (type === 'PROGRAM') {
    const enrollmentId = resourceId(metadata, 'enrollmentId')
    const enrollment = await prisma.programEnrollment.findUnique({ where: { id: enrollmentId }, include: { program: true } })
    if (!enrollment) throw new PaymentResourceError('Enrollment not found', 404)
    assertOwner(enrollment.userId, userId)
    assertBinding(metadata, 'programId', enrollment.programId)
    assertBinding(metadata, 'healerId', enrollment.healerId)
    if (!settled && (enrollment.status !== 'pending_payment' || !enrollment.program.isActive)) {
      throw new PaymentResourceError('Enrollment is not awaiting payment', 409)
    }
    return pricedResource(type, enrollment.program.pricePaise, {
      enrollmentId, programId: enrollment.programId, healerId: enrollment.healerId,
    })
  }

  if (type === 'COURSE') {
    const enrollmentId = resourceId(metadata, 'enrollmentId')
    const enrollment = await prisma.courseEnrollment.findUnique({ where: { id: enrollmentId }, include: { course: true } })
    if (!enrollment) throw new PaymentResourceError('Enrollment not found', 404)
    assertOwner(enrollment.userId, userId)
    assertBinding(metadata, 'courseId', enrollment.courseId)
    if (!settled && (enrollment.status !== 'pending_payment' || !enrollment.course.isActive)) {
      throw new PaymentResourceError('Enrollment is not awaiting payment', 409)
    }
    return pricedResource(type, enrollment.course.pricePaise, { enrollmentId, courseId: enrollment.courseId })
  }

  if (type === 'STORE') {
    const orderId = resourceId(metadata, 'orderId')
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) throw new PaymentResourceError('Order not found', 404)
    assertOwner(order.userId, userId)
    if (!settled && order.status !== 'pending_payment') {
      throw new PaymentResourceError('Order is not awaiting payment', 409)
    }
    return pricedResource(type, order.totalPaise, { orderId })
  }

  throw new PaymentResourceError('Use the membership subscription endpoint', 400)
}
