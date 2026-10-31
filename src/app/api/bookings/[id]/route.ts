import { isTestMode } from '@/lib/test-mode'
// app/api/bookings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateBookingSlot } from '@/lib/availability'
import { BookingError, lockOwnedBooking } from '@/lib/bookings/transactions'
import { RescheduleBody } from '../types'
import { computeRefund } from '@/lib/bookings/refund-policy'
import { fetchRefundStatus, hasRazorpayRefundCredentials, refundPayment } from '@/lib/payments/razorpay-refunds'

const CANCELLABLE_BOOKING_STATUSES = ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'] as const
const REFUND_IN_FLIGHT_STATUSES = new Set(['PENDING', 'UNKNOWN'])

type CancellationRefundStatus = 'NOT_REQUIRED' | 'UNAVAILABLE' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN'
type CancellationRefund = {
  band: 'FULL' | 'HALF' | 'NONE'
  refundPaise: number
  status: CancellationRefundStatus
  message: string
}
type PreparedCancellation = {
  booking: { id: string; status: string; updatedAt: Date; [key: string]: unknown }
  alreadyCancelled: boolean
  refund: CancellationRefund
  refundId?: string
  gatewayRefundId?: string
  gatewayPaymentId?: string
  paymentId?: string
  action?: 'SUBMIT' | 'FETCH'
  bookingId: string
  userId: string
}

function paymentWasCaptured(payment: { status: string; statusEnum: string | null }) {
  return payment.statusEnum
    ? payment.statusEnum === 'SUCCESS'
    : payment.status.toLowerCase() === 'success'
}

function refundStatusFromStored(value: string | null | undefined): CancellationRefundStatus {
  switch ((value || '').toUpperCase()) {
    case 'SUCCESS':
    case 'PROCESSED':
      return 'SUCCESS'
    case 'PENDING':
      return 'PENDING'
    case 'FAILED':
      return 'FAILED'
    case 'SIMULATED':
    case 'UNAVAILABLE':
      return 'UNAVAILABLE'
    default:
      return 'UNKNOWN'
  }
}

function cancellationRefundMessage(status: CancellationRefundStatus) {
  switch (status) {
    case 'SUCCESS':
      return 'Booking cancelled. Razorpay confirmed the refund.'
    case 'PENDING':
      return 'Booking cancelled. The refund is pending Razorpay confirmation.'
    case 'FAILED':
      return 'Booking cancelled, but Razorpay reported that the refund failed. Contact support.'
    case 'UNKNOWN':
      return 'Booking cancelled, but the refund status could not be confirmed. Contact support; do not submit another refund.'
    case 'UNAVAILABLE':
      return 'Booking cancelled, but an automatic refund is unavailable. Contact support for review.'
    case 'NOT_REQUIRED':
      return 'Booking cancelled. No cash refund is due for this booking.'
  }
}

function refundRequiresReview(refund: Pick<CancellationRefund, 'band' | 'refundPaise'>): CancellationRefund {
  return {
    ...refund,
    status: 'UNAVAILABLE',
    message: cancellationRefundMessage('UNAVAILABLE'),
  }
}

function isDefinitiveGatewayRejection(error: unknown) {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return false
  const statusCode = Number(error.statusCode)
  return statusCode >= 400 && statusCode < 500 && ![408, 409, 429].includes(statusCode)
}

async function updateRefundOutcome(
  refundId: string,
  gatewayRefundId: string | null,
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN',
) {
  await prisma.refund.update({
    where: { id: refundId },
    data: { gatewayRefundId, status },
  })
}

async function finishCancellationRefund(prepared: {
  refund: CancellationRefund
  refundId?: string
  gatewayRefundId?: string
  gatewayPaymentId?: string
  action?: 'SUBMIT' | 'FETCH'
  bookingId: string
  userId: string
}) {
  if (!prepared.refundId || !prepared.gatewayPaymentId || !prepared.action) return prepared.refund

  if (prepared.action === 'SUBMIT') {
    let result: Awaited<ReturnType<typeof refundPayment>>
    try {
      result = await refundPayment({
        paymentId: prepared.gatewayPaymentId,
        amountPaise: prepared.refund.refundPaise,
        receipt: `cancel_${prepared.bookingId}`,
        notes: { bookingId: prepared.bookingId, userId: prepared.userId },
      })
    } catch (error) {
      const status = isDefinitiveGatewayRejection(error) ? 'FAILED' : 'UNKNOWN'
      try {
        await updateRefundOutcome(prepared.refundId, null, status)
      } catch (persistError) {
        console.error('[refunds][error]', {
          bookingId: prepared.bookingId,
          refundId: prepared.refundId,
          stage: 'persist-submit-error',
          errorType: persistError instanceof Error ? persistError.name : 'unknown',
        })
        return { ...prepared.refund, status: 'UNKNOWN', message: cancellationRefundMessage('UNKNOWN') }
      }
      console.error('[refunds][error]', {
        bookingId: prepared.bookingId,
        refundId: prepared.refundId,
        stage: 'submit',
        status,
        errorType: error instanceof Error ? error.name : 'unknown',
      })
      return { ...prepared.refund, status, message: cancellationRefundMessage(status) }
    }

    if (!result.gatewayRefundId) {
      try {
        await updateRefundOutcome(prepared.refundId, null, 'UNKNOWN')
      } catch (persistError) {
        console.error('[refunds][error]', {
          bookingId: prepared.bookingId,
          refundId: prepared.refundId,
          stage: 'persist-missing-gateway-id',
          errorType: persistError instanceof Error ? persistError.name : 'unknown',
        })
      }
      return { ...prepared.refund, status: 'UNKNOWN', message: cancellationRefundMessage('UNKNOWN') }
    }
    try {
      await updateRefundOutcome(prepared.refundId, result.gatewayRefundId, result.status)
    } catch (persistError) {
      console.error('[refunds][error]', {
        bookingId: prepared.bookingId,
        refundId: prepared.refundId,
        stage: 'persist-submit-result',
        status: result.status,
        errorType: persistError instanceof Error ? persistError.name : 'unknown',
      })
      try {
        await updateRefundOutcome(prepared.refundId, result.gatewayRefundId, 'UNKNOWN')
      } catch (retryPersistError) {
        console.error('[refunds][error]', {
          bookingId: prepared.bookingId,
          refundId: prepared.refundId,
          stage: 'persist-uncertain-result',
          errorType: retryPersistError instanceof Error ? retryPersistError.name : 'unknown',
        })
      }
      return { ...prepared.refund, status: 'UNKNOWN', message: cancellationRefundMessage('UNKNOWN') }
    }
    return {
      ...prepared.refund,
      status: result.status,
      message: cancellationRefundMessage(result.status),
    }
  }

  try {
    if (!prepared.gatewayRefundId) throw new Error('Stored refund has no gateway identifier')
    const result = await fetchRefundStatus(prepared.gatewayRefundId, prepared.gatewayPaymentId)
    if (!result.gatewayRefundId) throw new Error('Gateway returned no refund identifier')
    await updateRefundOutcome(prepared.refundId, result.gatewayRefundId, result.status)
    return {
      ...prepared.refund,
      status: result.status,
      message: cancellationRefundMessage(result.status),
    }
  } catch (error) {
    console.error('[refunds][error]', {
      bookingId: prepared.bookingId,
      refundId: prepared.refundId,
      stage: 'fetch-status',
      errorType: error instanceof Error ? error.name : 'unknown',
    })
    return { ...prepared.refund, status: 'UNKNOWN', message: cancellationRefundMessage('UNKNOWN') }
  }
}

async function cancelOwnedBooking(id: string, userId: string) {
  const prepared = await prisma.$transaction<PreparedCancellation>(async tx => {
    await lockOwnedBooking(tx, id, userId)
    const booking = await tx.booking.findFirst({
      where: { id, userId },
      include: {
        payment: {
          select: {
            id: true,
            gateway: true,
            status: true,
            statusEnum: true,
            amountPaise: true,
            gatewayPaymentId: true,
          },
        },
      },
    })
    if (!booking) throw new BookingError('Booking not found', 404)

    const alreadyCancelled = booking.status === 'CANCELLED'
    const now = new Date()
    const cancelledAt = alreadyCancelled ? booking.updatedAt : now

    if (!alreadyCancelled) {
      if (booking.status === 'COMPLETED') throw new BookingError('not-cancellable', 400)
      if (!CANCELLABLE_BOOKING_STATUSES.includes(booking.status as typeof CANCELLABLE_BOOKING_STATUSES[number])) {
        throw new BookingError('Booking cannot be cancelled in its current state', 409)
      }
      if (booking.scheduledAt.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
        throw new BookingError('Cannot cancel booking less than 24 hours before scheduled time', 403)
      }
      const changed = await tx.booking.updateMany({
        where: { id, userId, status: booking.status },
        data: { status: 'CANCELLED', updatedAt: now },
      })
      if (changed.count !== 1) throw new BookingError('Booking changed; please try again', 409)
    }

    const cancelledBooking = {
      id: booking.id,
      userId: booking.userId,
      healerId: booking.healerId,
      serviceId: booking.serviceId,
      scheduledAt: booking.scheduledAt,
      durationMin: booking.durationMin,
      status: 'CANCELLED' as const,
      pricePaise: booking.pricePaise,
      meetingLink: booking.meetingLink,
      createdAt: booking.createdAt,
      updatedAt: alreadyCancelled ? booking.updatedAt : now,
    }
    const policy = computeRefund(booking.scheduledAt, cancelledAt, booking.pricePaise)
    const baseRefund: CancellationRefund = {
      ...policy,
      status: 'NOT_REQUIRED',
      message: cancellationRefundMessage('NOT_REQUIRED'),
    }
    const payment = booking.payment

    if (!payment || payment.amountPaise <= 0 || policy.refundPaise <= 0) {
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: { ...baseRefund, refundPaise: 0 },
        bookingId: id,
        userId,
      }
    }

    if (payment.statusEnum === 'REFUNDED' || payment.status.toLowerCase() === 'refunded') {
      if (payment.amountPaise !== booking.pricePaise) {
        return {
          booking: cancelledBooking,
          alreadyCancelled,
          refund: refundRequiresReview(policy),
          bookingId: id,
          userId,
        }
      }
      const priorRefunds = await tx.refund.findMany({ where: { paymentId: payment.id } })
      const confirmedPaise = priorRefunds.reduce((total, refund) =>
        refundStatusFromStored(refund.status) === 'SUCCESS' ? total + refund.amountPaise : total, 0)
      const refundStatus = confirmedPaise >= policy.refundPaise ? 'SUCCESS' : 'UNAVAILABLE'
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: {
          ...baseRefund,
          refundPaise: policy.refundPaise,
          status: refundStatus,
          message: cancellationRefundMessage(refundStatus),
        },
        bookingId: id,
        userId,
      }
    }

    if (payment.amountPaise !== booking.pricePaise) {
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: refundRequiresReview(policy),
        bookingId: id,
        userId,
      }
    }

    if (!paymentWasCaptured(payment)) {
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: { ...baseRefund, refundPaise: 0 },
        bookingId: id,
        userId,
      }
    }

    if (payment.gateway.toLowerCase() !== 'razorpay' || !payment.gatewayPaymentId) {
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: refundRequiresReview(policy),
        bookingId: id,
        userId,
      }
    }

    const refunds = await tx.refund.findMany({
      where: { paymentId: payment.id },
      orderBy: { createdAt: 'desc' },
    })
    const simulated = refunds.find(refund =>
      refund.amountPaise === policy.refundPaise && refundStatusFromStored(refund.status) === 'UNAVAILABLE'
    )
    if (simulated?.status?.toUpperCase() === 'SIMULATED' && hasRazorpayRefundCredentials()) {
      const upgraded = await tx.refund.update({
        where: { id: simulated.id },
        data: { status: 'PENDING', reason: 'booking-cancellation' },
      })
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: { ...baseRefund, status: 'PENDING' as const, message: cancellationRefundMessage('PENDING') },
        refundId: upgraded.id,
        gatewayPaymentId: payment.gatewayPaymentId,
        action: 'SUBMIT' as const,
        bookingId: id,
        userId,
      }
    }
    const deferredForConfiguration = refunds.find(refund =>
      refund.reason === 'gateway-not-configured' && refund.status?.toUpperCase() === 'UNAVAILABLE'
    )
    if (deferredForConfiguration) {
      if (!hasRazorpayRefundCredentials()) {
        return {
          booking: cancelledBooking,
          alreadyCancelled,
          refund: {
            ...baseRefund,
            refundPaise: deferredForConfiguration.amountPaise,
            status: 'UNAVAILABLE' as const,
            message: cancellationRefundMessage('UNAVAILABLE'),
          },
          bookingId: id,
          userId,
        }
      }
      const upgraded = await tx.refund.update({
        where: { id: deferredForConfiguration.id },
        data: { status: 'PENDING', reason: 'booking-cancellation' },
      })
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: {
          ...baseRefund,
          refundPaise: deferredForConfiguration.amountPaise,
          status: 'PENDING' as const,
          message: cancellationRefundMessage('PENDING'),
        },
        refundId: upgraded.id,
        gatewayPaymentId: payment.gatewayPaymentId,
        action: 'SUBMIT' as const,
        bookingId: id,
        userId,
      }
    }

    const existingCancellationAttempt = refunds.find(refund =>
      refund.reason === 'booking-cancellation'
      && refund.amountPaise === policy.refundPaise
      && ['PENDING', 'UNKNOWN', 'FAILED'].includes(refundStatusFromStored(refund.status))
    )
    if (existingCancellationAttempt) {
      const status = refundStatusFromStored(existingCancellationAttempt.status)
      const refundStatus: 'PENDING' | 'UNKNOWN' | 'FAILED' = status === 'FAILED'
        ? 'FAILED'
        : status === 'PENDING' && existingCancellationAttempt.gatewayRefundId
          ? 'PENDING'
          : 'UNKNOWN'
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: {
          ...baseRefund,
          status: refundStatus,
          message: cancellationRefundMessage(refundStatus),
        },
        refundId: existingCancellationAttempt.id,
        gatewayRefundId: existingCancellationAttempt.gatewayRefundId || undefined,
        gatewayPaymentId: payment.gatewayPaymentId,
        paymentId: payment.id,
        action: REFUND_IN_FLIGHT_STATUSES.has(status) && existingCancellationAttempt.gatewayRefundId ? 'FETCH' as const : undefined,
        bookingId: id,
        userId,
      }
    }

    const confirmedPaise = refunds.reduce((total, refund) =>
      ['SUCCESS'].includes(refundStatusFromStored(refund.status)) ? total + refund.amountPaise : total, 0)
    const inFlight = refunds.filter(refund => REFUND_IN_FLIGHT_STATUSES.has(refundStatusFromStored(refund.status)))
    const inFlightPaise = inFlight.reduce((total, refund) => total + refund.amountPaise, 0)
    if (confirmedPaise >= policy.refundPaise) {
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: { ...baseRefund, status: 'SUCCESS' as const, message: cancellationRefundMessage('SUCCESS') },
        bookingId: id,
        userId,
      }
    }
    if (inFlightPaise > 0) {
      const status: 'UNKNOWN' | 'PENDING' =
        inFlight.some(refund =>
          refundStatusFromStored(refund.status) === 'UNKNOWN' || !refund.gatewayRefundId
        ) ? 'UNKNOWN' : 'PENDING'
      const latestInFlight = inFlight[0]
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: { ...baseRefund, status, message: cancellationRefundMessage(status) },
        refundId: latestInFlight?.id,
        gatewayRefundId: latestInFlight?.gatewayRefundId || undefined,
        gatewayPaymentId: payment.gatewayPaymentId,
        paymentId: payment.id,
        action: latestInFlight?.gatewayRefundId ? 'FETCH' as const : undefined,
        bookingId: id,
        userId,
      }
    }

    if (alreadyCancelled) {
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: {
          ...baseRefund,
          refundPaise: policy.refundPaise,
          status: 'UNAVAILABLE' as const,
          message: cancellationRefundMessage('UNAVAILABLE'),
        },
        bookingId: id,
        userId,
      }
    }

    const amountPaise = policy.refundPaise - confirmedPaise
    const existingFailed = refunds.find(refund =>
      refund.reason === 'booking-cancellation'
      && refund.amountPaise === amountPaise
      && refundStatusFromStored(refund.status) === 'FAILED'
    )
    if (existingFailed) {
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: { ...baseRefund, status: 'FAILED' as const, message: cancellationRefundMessage('FAILED') },
        bookingId: id,
        userId,
      }
    }
    if (!hasRazorpayRefundCredentials()) {
      await tx.refund.create({
        data: { paymentId: payment.id, amountPaise, status: 'UNAVAILABLE', reason: 'gateway-not-configured' },
      })
      return {
        booking: cancelledBooking,
        alreadyCancelled,
        refund: {
          ...baseRefund,
          refundPaise: amountPaise,
          status: 'UNAVAILABLE' as const,
          message: cancellationRefundMessage('UNAVAILABLE'),
        },
        bookingId: id,
        userId,
      }
    }

    const refundIntent = await tx.refund.create({
      data: { paymentId: payment.id, amountPaise, status: 'PENDING', reason: 'booking-cancellation' },
    })
    return {
      booking: cancelledBooking,
      alreadyCancelled,
      refund: {
        ...baseRefund,
        refundPaise: amountPaise,
        status: 'PENDING' as const,
        message: cancellationRefundMessage('PENDING'),
      },
      refundId: refundIntent.id,
      gatewayPaymentId: payment.gatewayPaymentId,
      action: 'SUBMIT' as const,
      bookingId: id,
      userId,
    }
  }, { maxWait: 10000, timeout: 10000, isolationLevel: 'ReadCommitted' })

  const refund = await finishCancellationRefund(prepared)
  if (prepared.action === 'FETCH' && prepared.paymentId && refund.status === 'SUCCESS') {
    try {
      const refunds = await prisma.refund.findMany({ where: { paymentId: prepared.paymentId } })
      const confirmedPaise = refunds.reduce((total, row) =>
        refundStatusFromStored(row.status) === 'SUCCESS' ? total + row.amountPaise : total, 0)
      const inFlight = refunds.filter(row => REFUND_IN_FLIGHT_STATUSES.has(refundStatusFromStored(row.status)))
      if (confirmedPaise < refund.refundPaise || inFlight.length > 0) {
        const status: CancellationRefundStatus = inFlight.length === 0
          ? 'UNAVAILABLE'
          : inFlight.some(row =>
            refundStatusFromStored(row.status) === 'UNKNOWN' || !row.gatewayRefundId
          ) ? 'UNKNOWN' : 'PENDING'
        return {
          booking: prepared.booking,
          alreadyCancelled: prepared.alreadyCancelled,
          refund: { ...refund, status, message: cancellationRefundMessage(status) },
        }
      }
    } catch (error) {
      console.error('[refunds][error]', {
        bookingId: prepared.bookingId,
        refundId: prepared.refundId,
        stage: 'verify-cumulative-outcome',
        errorType: error instanceof Error ? error.name : 'unknown',
      })
      return {
        booking: prepared.booking,
        alreadyCancelled: prepared.alreadyCancelled,
        refund: { ...refund, status: 'UNKNOWN', message: cancellationRefundMessage('UNKNOWN') },
      }
    }
  }
  return { booking: prepared.booking, alreadyCancelled: prepared.alreadyCancelled, refund }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const booking = await prisma.booking.findFirst({
      where: {
        id,
        userId: session.user.id
      },
      include: {
        healer: {
          include: {
            user: {
              select: {
                name: true,
                image: true
              }
            }
          }
        },
        service: {
          select: {
            name: true,
            category: true,
            duration: true
          }
        },
        payment: {
          select: {
            status: true,
            amountPaise: true
          }
        }
      }
    })

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: booking
    })

  } catch (error) {
    console.error('Get booking error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let json: Record<string, unknown>
    if (isTestMode()) {
      const raw = await request.text().catch(() => '')
      console.debug('[TEST_MODE] /api/bookings/[id] PUT raw body:', raw || '(none)')
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch (err) {
        console.error('[TEST_MODE] JSON parse failed for /api/bookings/[id] PUT', err, 'raw:', raw)
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      }
    } else {
      json = await request.json()
    }
    const parsed = RescheduleBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { scheduledAt } = parsed.data

    const newScheduledDate = new Date(scheduledAt)
    if (isNaN(newScheduledDate.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduledAt date format' }, { status: 400 })
    }

    const updatedBooking = await prisma.$transaction(async tx => {
      const lockedHealerId = await lockOwnedBooking(tx, id, session.user.id!)
      // Re-read after acquiring the healer lock: a competing reschedule may
      // have changed the booking while this request waited.
      const existingBooking = await tx.booking.findFirst({ where: { id, userId: session.user.id } })
      if (!existingBooking || existingBooking.healerId !== lockedHealerId) {
        throw new BookingError('Booking not found', 404)
      }
      if (!['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(existingBooking.status)) {
        throw new BookingError('Booking cannot be rescheduled in its current state', 409)
      }

      const now = new Date()
      if (existingBooking.scheduledAt.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
        throw new BookingError('Cannot reschedule booking less than 24 hours before scheduled time', 403)
      }
      if (newScheduledDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
        throw new BookingError('Cannot reschedule to a time less than 24 hours from now', 400)
      }

      const validation = await validateBookingSlot(existingBooking.healerId, existingBooking.serviceId, newScheduledDate, {
        client: tx, excludeBookingId: id, durationMin: existingBooking.durationMin,
      })
      if (!validation.valid) throw new BookingError(validation.error || 'Time slot not available', 409)

      // A concurrent cancellation/status update need not take the healer lock.
      // Do not overwrite it or revive a cancelled booking from a stale read.
      const changed = await tx.booking.updateMany({
        where: { id, userId: session.user.id, status: existingBooking.status,
          scheduledAt: existingBooking.scheduledAt, updatedAt: existingBooking.updatedAt },
        data: { scheduledAt: newScheduledDate, status: 'RESCHEDULED', updatedAt: new Date() },
      })
      if (changed.count !== 1) throw new BookingError('Booking changed; please try again', 409)
      return tx.booking.findUniqueOrThrow({
        where: { id },
        include: {
          healer: { include: { user: { select: { name: true, image: true } } } },
          service: { select: { name: true, category: true, duration: true } },
        },
      })
    }, { maxWait: 10000, timeout: 10000, isolationLevel: 'ReadCommitted' })

    return NextResponse.json({
      success: true,
      data: updatedBooking,
      message: 'Booking rescheduled successfully'
    })

  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Update booking error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const result = await cancelOwnedBooking(id, session.user.id)

    return NextResponse.json({
      success: true,
      ok: true,
      data: result.booking,
      alreadyCancelled: result.alreadyCancelled,
      refund: result.refund,
      bookingId: id,
      message: result.refund.message,
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Cancel booking error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: Record<string, unknown>
    if (isTestMode()) {
      const raw = await request.text().catch(() => '')
      console.debug('[TEST_MODE] /api/bookings/[id] PATCH raw body:', raw || '(none)')
      try {
        body = raw ? JSON.parse(raw) : {}
      } catch (err) {
        console.error('[TEST_MODE] JSON parse failed for /api/bookings/[id] PATCH', err, 'raw:', raw)
        body = {}
      }
    } else {
      body = await request.json().catch(() => ({} as any)) // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    if (body?.action !== 'cancel') {
      return NextResponse.json({ error: 'Unsupported action' }, { status: 400 })
    }

    const result = await cancelOwnedBooking(id, session.user.id)
    return NextResponse.json({
      success: true,
      ok: true,
      data: result.booking,
      alreadyCancelled: result.alreadyCancelled,
      refund: result.refund,
      bookingId: id,
      message: result.refund.message,
    })
  } catch (error) {
    if (error instanceof BookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[booking][cancel][error]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
