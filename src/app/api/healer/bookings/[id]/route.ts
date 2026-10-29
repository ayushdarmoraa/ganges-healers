import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import { z } from 'zod'

const actionSchema = z.object({
  action: z.enum(['CONFIRM', 'CANCEL', 'COMPLETE']),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { healer } = await requireHealer()
    const { id } = await params

    // Verify booking belongs to this healer
    const booking = await prisma.booking.findUnique({
      where: { id },
      select: { id: true, healerId: true, status: true },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (booking.healerId !== healer.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid action. Use CONFIRM, CANCEL, or COMPLETE.' },
        { status: 400 },
      )
    }

    const { action } = parsed.data

    // Validate state transitions
    const transitions: Record<string, string[]> = {
      CONFIRM: ['PENDING', 'SCHEDULED'],
      CANCEL: ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'],
      COMPLETE: ['CONFIRMED'],
    }

    if (!transitions[action].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot ${action} a booking with status ${booking.status}` },
        { status: 400 },
      )
    }

    const statusMap: Record<string, string> = {
      CONFIRM: 'CONFIRMED',
      CANCEL: 'CANCELLED',
      COMPLETE: 'COMPLETED',
    }

    // Reject stale transitions so a concurrent cancellation cannot be undone.
    const changed = await prisma.booking.updateMany({
      where: { id, healerId: healer.id, status: booking.status },
      data: { status: statusMap[action] as 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' },
    })
    if (changed.count !== 1) {
      return NextResponse.json({ error: 'Booking changed; please try again' }, { status: 409 })
    }
    const updated = await prisma.booking.findUniqueOrThrow({
      where: { id },
      include: {
        service: { select: { name: true, category: true } },
        user: { select: { id: true, name: true, email: true } },
        payment: { select: { status: true, amountPaise: true } },
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status },
      )
    }
    console.error('Healer booking action error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
