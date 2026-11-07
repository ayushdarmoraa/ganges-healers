import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import { z } from 'zod'
import { lockTransaction } from '@/lib/db/locks'
import { BookingError } from '@/lib/bookings/transactions'
import { healerBookingCapabilities, safeMeetingLink } from '@/lib/bookings/session-delivery'

const actionSchema = z.union([
  z.object({ action: z.enum(['CONFIRM', 'CANCEL', 'COMPLETE']) }),
  z.object({ action: z.literal('SET_MEETING_LINK'), meetingLink: z.string().trim().nullable().refine(value => value === null || safeMeetingLink(value) !== null, 'Use an HTTPS meeting URL without embedded credentials'), version: z.string().datetime() }).strict(),
])
const headers = { 'Cache-Control': 'private, no-store' }
export const dynamic = 'force-dynamic'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { healer, user } = await requireHealer()
    const { id } = await params
    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers }) }
    const parsed = actionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Use a valid booking action and an HTTPS meeting URL with its saved version when editing a link.' },
        { status: 400, headers },
      )
    }

    const updated = await prisma.$transaction(async tx => {
      await lockTransaction(tx, 'healer', healer.id)
      const currentHealer = await tx.healer.findUnique({ where: { id: healer.id }, select: { userId: true, user: { select: { role: true } } } })
      if (currentHealer?.userId !== user.id || currentHealer.user.role !== 'HEALER') throw new BookingError('Forbidden', 403)
      const booking = await tx.booking.findUnique({ where: { id }, include: { payment: { select: { status: true, statusEnum: true, amountPaise: true, gateway: true } } } })
      if (!booking) throw new BookingError('Booking not found', 404)
      if (booking.healerId !== healer.id) throw new BookingError('Forbidden', 403)
      const capability = healerBookingCapabilities(booking)
      const nextUpdatedAt = new Date(Math.max(Date.now(), booking.updatedAt.getTime() + 1))
      const input = parsed.data
      if (input.action === 'SET_MEETING_LINK') {
        if (booking.updatedAt.toISOString() !== input.version) throw new BookingError('Booking changed. Your link draft is preserved; reload the saved booking before trying again.', 409)
        if (!capability.canSetMeetingLink) throw new BookingError('Meeting links can be changed only for an upcoming or ongoing confirmed session.', 409)
        const changed = await tx.booking.updateMany({ where: { id, healerId: healer.id, status: booking.status, updatedAt: booking.updatedAt }, data: { meetingLink: input.meetingLink === null ? null : safeMeetingLink(input.meetingLink), updatedAt: nextUpdatedAt } })
        if (changed.count !== 1) throw new BookingError('Booking changed; please reload the saved booking.', 409)
      } else {
        const transitions = { CONFIRM: ['PENDING', 'SCHEDULED'], CANCEL: ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'], COMPLETE: ['CONFIRMED', 'RESCHEDULED'] }
        if (!transitions[input.action].includes(booking.status)) throw new BookingError(`Cannot ${input.action} a booking with status ${booking.status}`, 400)
        if (input.action === 'CONFIRM' && !capability.canConfirm) throw new BookingError('Confirmation requires a future session and a verified payment, applied session credit, or free booking.', 409)
        if (input.action === 'COMPLETE' && !capability.canComplete) throw new BookingError('A session can be completed only after its scheduled end.', 409)
        if (input.action === 'CANCEL' && !capability.canCancel) throw new BookingError('This payment or used session credit requires cancellation and refund review. No cancellation was applied.', 409)
        const statusMap = { CONFIRM: 'CONFIRMED', CANCEL: 'CANCELLED', COMPLETE: 'COMPLETED' } as const
        const changed = await tx.booking.updateMany({ where: { id, healerId: healer.id, status: booking.status, updatedAt: booking.updatedAt }, data: { status: statusMap[input.action], updatedAt: nextUpdatedAt } })
        if (changed.count !== 1) throw new BookingError('Booking changed; please try again', 409)
      }
      await tx.activityLog.create({ data: { userId: user.id, action: input.action === 'SET_MEETING_LINK' ? 'booking_meeting_link_updated' : `booking_${input.action.toLowerCase()}_by_healer`, entityType: 'booking', entityId: booking.id, metadata: { action: input.action, ...(input.action === 'SET_MEETING_LINK' ? { hasMeetingLink: input.meetingLink !== null } : {}) } } })
      return tx.booking.findUniqueOrThrow({ where: { id }, include: { service: { select: { name: true, category: true } }, user: { select: { id: true, name: true, email: true } }, payment: { select: { status: true, statusEnum: true, amountPaise: true, gateway: true } } } })
    }, { maxWait: 10000, timeout: 10000 })
    return NextResponse.json({ success: true, data: updated }, { headers })
  } catch (error: unknown) {
    const status = error instanceof BookingError ? error.status : (error as { status?: number }).status
    if (error instanceof BookingError || status === 401 || status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status, headers },
      )
    }
    console.error('Healer booking action error:', { type: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers },
    )
  }
}
