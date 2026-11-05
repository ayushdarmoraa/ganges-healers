import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { programActor, ProgramAccessError } from '@/lib/programs/enrollments'
import { calendarResponse } from '@/lib/bookings/calendar'
export const dynamic = 'force-dynamic'
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; number: string }> }) {
  try {
    const actor = await programActor()
    const { id, number } = await params
    const sessionNumber = Number(number)
    if (!Number.isSafeInteger(sessionNumber) || sessionNumber < 1 || sessionNumber > 366) return NextResponse.json({ error: 'Invalid session number' }, { status: 400 })
    const row = await prisma.programSession.findUnique({ where: { enrollmentId_sessionNumber: { enrollmentId: id, sessionNumber } }, include: { enrollment: { select: { userId: true, healerId: true, assignedHealerId: true, status: true, program: { select: { title: true } } } }, healer: { select: { user: { select: { name: true } } } } } })
    if (!row || actor.id !== row.enrollment.userId && actor.role !== 'ADMIN' && (!actor.healerId || actor.healerId !== (row.enrollment.assignedHealerId ?? row.enrollment.healerId))) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    const cancelled = row.status === 'CANCELLED' || row.enrollment.status === 'cancelled'
    return calendarResponse({ id: `program-${row.id}`, title: `${row.enrollment.program.title} · Session ${row.sessionNumber}`, description: `Ganges Healers program session with ${row.healer.user.name || 'your practitioner'}. Check My Programs for current details.`, start: row.scheduledAt, durationMin: row.durationMin, updatedAt: row.updatedAt, status: cancelled ? 'CANCELLED' : 'CONFIRMED', meetingLink: cancelled ? null : row.meetingLink })
  } catch (error) {
    if (error instanceof ProgramAccessError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[programs][sessions][calendar_failed]')
    return NextResponse.json({ error: 'Could not export program appointment' }, { status: 500 })
  }
}
