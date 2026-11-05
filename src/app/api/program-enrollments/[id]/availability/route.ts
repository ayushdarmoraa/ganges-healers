import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getProgramEnrollment, programActor, ProgramAccessError } from '@/lib/programs/enrollments'
import { getHealerAvailability } from '@/lib/availability'
import { clinicDate } from '@/lib/bookings/time'
export const dynamic = 'force-dynamic'
const query = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sessionNumber: z.coerce.number().int().min(1).max(366) })
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await programActor()
    const enrollment = await getProgramEnrollment(actor, (await params).id)
    if (!enrollment.canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid date or session number' }, { status: 400 })
    const { date, sessionNumber } = parsed.data
    const instant = new Date(`${date}T00:00:00.000Z`)
    if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== date || date < clinicDate(new Date())) return NextResponse.json({ error: 'Choose a valid date today or later' }, { status: 400 })
    const session = enrollment.sessions.find(row => row.sessionNumber === sessionNumber)
    if (enrollment.status !== 'active' || !enrollment.healer || !session || session.status === 'completed') return NextResponse.json({ error: 'This program session cannot be scheduled' }, { status: 409 })
    return NextResponse.json({ success: true, data: await getHealerAvailability(enrollment.healer.id, date, session.durationMin, undefined, session.id ?? undefined) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof ProgramAccessError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[programs][sessions][availability_failed]')
    return NextResponse.json({ error: 'Could not check available times' }, { status: 500 })
  }
}
