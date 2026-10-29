// app/api/availability/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getHealerAvailability } from '@/lib/availability'
import { clinicDate } from '@/lib/bookings/time'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const healerId = searchParams.get('healerId')
    const date = searchParams.get('date')
    const serviceId = searchParams.get('serviceId')
    const bookingId = searchParams.get('bookingId')
    
    // Validation
    if (!healerId) {
      return NextResponse.json(
        { error: 'healerId is required' },
        { status: 400 }
      )
    }
    
    if (!date) {
      return NextResponse.json(
        { error: 'date is required (YYYY-MM-DD format)' },
        { status: 400 }
      )
    }
    
    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const targetDate = new Date(date + 'T00:00:00.000Z')
    if (!dateRegex.test(date) || Number.isNaN(targetDate.getTime()) || targetDate.toISOString().slice(0, 10) !== date) {
      return NextResponse.json(
        { error: 'Invalid date format. Use YYYY-MM-DD' },
        { status: 400 }
      )
    }
    
    // Check if date is not in the past
    if (date < clinicDate(new Date())) {
      return NextResponse.json(
        { error: 'Cannot get availability for past dates' },
        { status: 400 }
      )
    }
    
    // Get availability
    let duration = 60 // Preserve the existing API default for callers without a service.
    let excludedBookingId: string | undefined
    if (bookingId) {
      const session = await auth()
      if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, userId: session.user.id, healerId },
        select: { id: true, durationMin: true, serviceId: true, status: true, service: { select: { isActive: true } } },
      })
      if (!booking || (serviceId && booking.serviceId !== serviceId)) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      if (!['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(booking.status) ||
          !booking.service.isActive || !Number.isSafeInteger(booking.durationMin) || booking.durationMin <= 0) {
        return NextResponse.json({ error: 'Booking cannot be rescheduled' }, { status: 409 })
      }
      duration = booking.durationMin
      excludedBookingId = booking.id
    } else if (serviceId) {
      const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { duration: true, isActive: true } })
      if (!service?.isActive || !Number.isSafeInteger(service.duration) || service.duration <= 0) {
        return NextResponse.json({ error: 'Service not found or inactive' }, { status: 404 })
      }
      duration = service.duration
    }
    const availability = await getHealerAvailability(healerId, date, duration, excludedBookingId)
    
    return NextResponse.json({
      success: true,
      data: availability
    })
    
  } catch (error) {
    console.error('Availability API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
