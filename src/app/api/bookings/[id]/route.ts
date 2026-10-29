import { isTestMode } from '@/lib/test-mode'
// app/api/bookings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateBookingSlot } from '@/lib/availability'
import { BookingError, lockOwnedBooking } from '@/lib/bookings/transactions'
import { RescheduleBody } from '../types'
import { computeRefund } from '@/lib/bookings/refund-policy'
import { refundPayment } from '@/lib/payments/razorpay-refunds'

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

    // Get existing booking
    const existingBooking = await prisma.booking.findFirst({
      where: {
        id,
        userId: session.user.id
      }
    })

    if (!existingBooking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Check if booking can be cancelled (24h rule)
    const now = new Date()
    const timeUntilBooking = existingBooking.scheduledAt.getTime() - now.getTime()
    const hoursUntilBooking = timeUntilBooking / (1000 * 60 * 60)

    if (hoursUntilBooking < 24) {
      return NextResponse.json(
        { error: 'Cannot cancel booking less than 24 hours before scheduled time' },
        { status: 403 }
      )
    }

    // Update booking status instead of deleting (for audit trail)
    const cancelledBooking = await prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date()
      }
    })

    return NextResponse.json({
      success: true,
      data: cancelledBooking,
      message: 'Booking cancelled successfully'
    })

  } catch (error) {
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

    // Load booking with context
    const booking = await prisma.booking.findFirst({
      where: { id, userId: session.user.id },
      include: {
        service: { select: { duration: true, price: true } },
        payment: { select: { id: true, status: true, statusEnum: true, amountPaise: true, gatewayPaymentId: true } },
      },
    })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

    // Idempotent: if already cancelled, short-circuit
    if (booking.status === 'CANCELLED') {
      return NextResponse.json({ ok: true, alreadyCancelled: true, refund: { band: 'NONE', refundPaise: 0 }, bookingId: booking.id })
    }

    // Eligibility guard: forbid cancelling completed
    if (booking.status === 'COMPLETED') {
      return NextResponse.json({ error: 'not-cancellable' }, { status: 400 })
    }

    const now = new Date()
    const pricePaise = Number.isFinite(booking.payment?.amountPaise) ? (booking.payment?.amountPaise || Math.round((booking.service?.price || 0) * 100)) : Math.round((booking.service?.price || 0) * 100)
    let refund = computeRefund(booking.scheduledAt, now, pricePaise)
    // If there is no payment (e.g., credits booking), no monetary refund is due
    if (!booking.payment?.id) {
      refund = { band: refund.band, refundPaise: 0 }
    }

    // Free slot: make the slot available by updating status only (availability source derives from active statuses)
    // We consider SCHEDULED/CONFIRMED/PENDING as occupying slots; CANCELLED frees slot automatically via availability queries.

    // Mark cancelled
    await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', updatedAt: now } })

    // Refund side-effect with feature flag; idempotent on Refund rows for this payment and amount
    if (refund.refundPaise > 0 && booking.payment?.id) {
      const pid = booking.payment.id
      const amount = refund.refundPaise
      const existingRefund = await prisma.refund.findFirst({ where: { paymentId: pid, amountPaise: amount, status: { in: ['PENDING','SUCCESS','pending','SUCCESS','SIMULATED'] as any } } as any }) // eslint-disable-line @typescript-eslint/no-explicit-any
      if (existingRefund) {
        console.log('[refunds][issue][idempotent_hit]', { paymentId: pid, amountPaise: amount, refundId: existingRefund.id })
      } else if (process.env.REFUNDS_ENABLED === 'true' && booking.payment.gatewayPaymentId) {
        try {
          const result = await refundPayment({ paymentId: booking.payment.gatewayPaymentId, amountPaise: amount, notes: { bookingId: booking.id, userId: booking.userId } })
          await prisma.refund.create({ data: { paymentId: pid, amountPaise: amount, status: result.status, gatewayRefundId: result.gatewayRefundId } })
          console.log('[refunds][issue]', { bookingId: booking.id, paymentId: pid, refundPaise: amount, gatewayRefundId: result.gatewayRefundId, status: result.status })
        } catch (err) {
          console.error('[refunds][error]', { bookingId: booking.id, paymentId: pid, refundPaise: amount, error: (err as Error).message })
          // Do not fail request; ops can reconcile
        }
      } else {
        console.log('[refunds][issue][simulated]', { paymentId: pid, amountPaise: amount })
        await prisma.refund.create({ data: { paymentId: pid, amountPaise: amount, status: 'SIMULATED' } })
      }
    }

    // Notifications are non-blocking (placeholder logs)
    console.log('[booking][cancel]', { bookingId: booking.id, refund })

    return NextResponse.json({ ok: true, refund, bookingId: booking.id })
  } catch (error) {
    console.error('[booking][cancel][error]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
