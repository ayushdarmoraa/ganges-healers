// app/api/bookings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateBookingSlot } from '@/lib/availability'
import { RescheduleBody } from '../types'

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