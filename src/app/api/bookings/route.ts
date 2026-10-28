import { isTestMode } from '@/lib/test-mode'
// app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateBookingSlot } from '@/lib/availability'
import { logActivity } from '@/lib/activity-log'
import { emailService } from '@/lib/email/email.service'
import { format } from 'date-fns'
import { CreateBookingBody } from './types'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const allowedStatuses = ['PENDING','SCHEDULED','CONFIRMED','RESCHEDULED','CANCELLED','COMPLETED'] as const
    const where: { userId: string; status?: typeof allowedStatuses[number] } = { userId: session.user.id }
    if (status) {
      const upper = status.toUpperCase()
      if ((allowedStatuses as readonly string[]).includes(upper)) {
        where.status = upper as typeof allowedStatuses[number]
      }
    }

    const bookings = await prisma.booking.findMany({
      where,
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
            slug: true,
          }
        },
        payment: {
          select: {
            status: true,
            amountPaise: true
          }
        }
      },
      orderBy: {
        scheduledAt: 'desc'
      }
    })

    return NextResponse.json({
      success: true,
      data: bookings
    })

  } catch (error) {
    console.error('Get bookings error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    // In TEST_MODE, allow an override via header for deterministic E2E API calls
    const testUserId = isTestMode() ? request.headers.get('x-test-user-id') : null
    const userId = session?.user?.id || testUserId
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    let json: Record<string, unknown>
    if (isTestMode()) {
      const raw = await request.text().catch(() => '')
      console.debug('[TEST_MODE] /api/bookings POST raw body:', raw || '(none)')
      try {
        json = raw ? JSON.parse(raw) : {}
      } catch (err) {
        console.error('[TEST_MODE] JSON parse failed for /api/bookings POST', err, 'raw:', raw)
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      }
    } else {
      json = await request.json()
    }
    const parsed = CreateBookingBody.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }
    const { healerId, serviceId, scheduledAt } = parsed.data
    const scheduledDate = new Date(scheduledAt)
    if (isNaN(scheduledDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid scheduledAt date format' },
        { status: 400 }
      )
    }

    // Validate booking slot
    const validation = await validateBookingSlot(healerId, serviceId, scheduledDate)
    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 409 } // Conflict
      )
    }

    // Get service details for pricing and duration
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: {
        price: true,
        duration: true,
        name: true
      }
    })

    if (!service) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404 }
      )
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        userId,
        healerId,
        serviceId,
        scheduledAt: scheduledDate,
        durationMin: service.duration,
        status: 'PENDING',
        pricePaise: Math.round(service.price * 100), // Convert to paise
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

    // Fire and forget confirmation email
    if (booking && emailService.isEnabled()) {
      const serviceName = booking.service?.name || 'Service'
      const healerName = booking.healer?.user?.name || 'Healer'
      const scheduled = new Date(booking.scheduledAt)
      emailService.sendBookingConfirmation({
        // Assuming email exists on session.user; if not present in type, cast minimally
        to: (session?.user as { email?: string } | undefined)?.email || '',
        userName: session?.user?.name || 'User',
        serviceName,
        healerName,
        date: format(scheduled, 'MMMM d, yyyy'),
        time: format(scheduled, 'h:mm a'),
        bookingId: booking.id
      }).catch(err => console.error('Async email error:', err))
    }

    logActivity({ userId: session?.user?.id, action: 'booking_created', entityType: 'booking', entityId: booking.id, metadata: { serviceId: booking.serviceId, healerId: booking.healerId } })
    return NextResponse.json({
      success: true,
      data: booking,
      message: 'Booking created successfully'
    }, { status: 201 })

  } catch (error) {
    console.error('Create booking error:', error)
    
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'Time slot already booked' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}