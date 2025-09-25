// app/api/bookings/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { validateBookingSlot } from '@/lib/availability'

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
    
    const where: any = {
      userId: session.user.id
    }
    
    if (status) {
      where.status = status.toUpperCase()
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
            category: true
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
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { healerId, serviceId, scheduledAt } = body

    // Validation
    if (!healerId || !serviceId || !scheduledAt) {
      return NextResponse.json(
        { error: 'healerId, serviceId, and scheduledAt are required' },
        { status: 400 }
      )
    }

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
        userId: session.user.id,
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