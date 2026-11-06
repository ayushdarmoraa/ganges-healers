import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'

export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: NextRequest) {
  try {
    const { healer } = await requireHealer()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const filter = searchParams.get('filter') // 'upcoming' | 'past'

    const now = new Date()

    const where: Record<string, unknown> = { healerId: healer.id }

    // Status filter
    const allowedStatuses = ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'COMPLETED', 'CANCELLED'] as const
    if (status) {
      const upper = status.toUpperCase()
      if ((allowedStatuses as readonly string[]).includes(upper)) {
        where.status = upper
      }
    }

    // Time filter
    if (filter === 'upcoming') {
      where.scheduledAt = { gte: now }
    } else if (filter === 'past') {
      where.scheduledAt = { lt: now }
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        service: {
          select: { name: true, category: true, slug: true, duration: true },
        },
        user: {
          select: { id: true, name: true, email: true, image: true },
        },
        payment: {
          select: { status: true, amountPaise: true, statusEnum: true, gateway: true },
        },
      },
      orderBy: { scheduledAt: 'asc' },
    })

    return NextResponse.json({ success: true, data: bookings }, { headers })
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status, headers },
      )
    }
    console.error('Healer bookings GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers },
    )
  }
}
