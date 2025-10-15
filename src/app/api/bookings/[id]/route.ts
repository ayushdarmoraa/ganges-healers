// app/api/bookings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateBookingSlot } from '@/lib/availability'
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

    const json = await request.json()
    const parsed = RescheduleBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { scheduledAt } = parsed.data

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

    // Check if booking can be rescheduled (24h rule)
    const now = new Date()
    const timeUntilBooking = existingBooking.scheduledAt.getTime() - now.getTime()
    const hoursUntilBooking = timeUntilBooking / (1000 * 60 * 60)

    if (hoursUntilBooking < 24) {
      return NextResponse.json(
        { error: 'Cannot reschedule booking less than 24 hours before scheduled time' },
        { status: 403 }
      )
    }

    const newScheduledDate = new Date(scheduledAt)
    if (isNaN(newScheduledDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid scheduledAt date format' },
        { status: 400 }
      )
    }

    // Check if NEW time is at least 24 hours in the future
    const timeUntilNewBooking = newScheduledDate.getTime() - now.getTime()
    const hoursUntilNewBooking = timeUntilNewBooking / (1000 * 60 * 60)
    
    if (hoursUntilNewBooking < 24) {
      return NextResponse.json(
        { error: 'Cannot reschedule to a time less than 24 hours from now' },
        { status: 400 }
      )
    }

    // Validate new booking slot
    const validation = await validateBookingSlot(
      existingBooking.healerId,
      existingBooking.serviceId,
      newScheduledDate
    )
    
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 409 }
      )
    }

    // Update booking
    const updatedBooking = await prisma.booking.update({
      where: { id },
      data: {
        scheduledAt: newScheduledDate,
        status: 'RESCHEDULED',
        updatedAt: new Date()
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
        }
      }
    })

    return NextResponse.json({
      success: true,
      data: updatedBooking,
      message: 'Booking rescheduled successfully'
    })

  } catch (error) {
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

    const body = await request.json().catch(() => ({} as any)) // eslint-disable-line @typescript-eslint/no-explicit-any
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