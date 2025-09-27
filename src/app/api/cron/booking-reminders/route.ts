import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { addDays, format } from 'date-fns'

type BookingWithRelations = {
  id: string
  scheduledAt: Date
  status: string
  user: { email: string; name: string | null }
  service: { name: string }
  healer: { user: { name: string | null } }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tomorrow = addDays(new Date(), 1)
    const startOfDay = new Date(
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      0,
      0,
      0,
      0
    )
    const endOfDay = new Date(
      tomorrow.getFullYear(),
      tomorrow.getMonth(),
      tomorrow.getDate(),
      23,
      59,
      59,
      999
    )

    const upcomingBookings = await prisma.booking.findMany({
      where: {
        scheduledAt: { gte: startOfDay, lte: endOfDay },
        status: { in: ['CONFIRMED', 'RESCHEDULED'] }
      },
      include: {
        user: true,
        service: true,
        healer: { include: { user: true } }
      }
    })

    const results = await Promise.all(
      upcomingBookings.map((booking: BookingWithRelations) =>
        emailService.sendBookingReminder({
          to: booking.user.email,
          userName: booking.user.name || 'User',
          serviceName: booking.service.name,
          healerName: booking.healer.user?.name || 'Healer',
          date: format(booking.scheduledAt, 'MMMM d, yyyy'),
          time: format(booking.scheduledAt, 'h:mm a'),
          bookingId: booking.id
        })
      )
    )

    return NextResponse.json({
      success: true,
      remindersSent: results.filter(r => r.success).length,
      total: upcomingBookings.length
    })
  } catch (error) {
    console.error('Reminder cron error:', error)
    return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 })
  }
}
