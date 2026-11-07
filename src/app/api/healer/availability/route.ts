import { createHash } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import { lockTransaction } from '@/lib/db/locks'
import { readWeeklyAvailability, weeklyAvailabilitySchema } from '@/lib/bookings/availability-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const privateHeaders = { 'Cache-Control': 'private, no-store' }
function version(healerId: string, value: unknown) {
  return `"availability-${createHash('sha256').update(`${healerId}:${JSON.stringify(readWeeklyAvailability(value) ?? value)}`).digest('hex')}"`
}
function failure(error: unknown, method: 'GET' | 'PUT') {
  const status = (error as { status?: number })?.status
  if (status === 401 || status === 403) return NextResponse.json({ error: (error as Error).message }, { status, headers: privateHeaders })
  // Preserve the existing namespace without logging a submitted private schedule.
  console.error(`Healer availability ${method} error:`, { name: error instanceof Error ? error.name : 'UnknownError' })
  return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: privateHeaders })
}
export async function GET() {
  try {
    const { healer } = await requireHealer()
    const schedule = readWeeklyAvailability(healer.availability)
    if (!schedule) return NextResponse.json({ error: 'Stored availability needs review before editing.' }, { status: 409, headers: privateHeaders })
    return NextResponse.json({ success: true, data: schedule }, { headers: { ...privateHeaders, ETag: version(healer.id, schedule) } })
  } catch (error) { return failure(error, 'GET') }
}
export async function PUT(request: NextRequest) {
  try {
    const { user, healer } = await requireHealer()
    const parsed = weeklyAvailabilitySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400, headers: privateHeaders })
    const ifMatch = request.headers.get('if-match')
    return await prisma.$transaction(async tx => {
      // Coordinate schedule edits with ordinary and program appointment writers.
      await lockTransaction(tx, 'healer', healer.id)
      const current = await tx.healer.findUnique({ where: { id: healer.id }, select: { userId: true, availability: true, user: { select: { role: true } } } })
      if (!current || current.userId !== user.id || current.user.role !== 'HEALER') return NextResponse.json({ error: 'Forbidden: healer only' }, { status: 403, headers: privateHeaders })
      const etag = version(healer.id, current.availability)
      if (ifMatch && ifMatch.trim() !== '*' && !ifMatch.split(',').some(tag => tag.trim() === etag)) return NextResponse.json({ error: 'Availability changed in another session. Reload the saved hours before trying again.' }, { status: 412, headers: privateHeaders })
      const updated = await tx.healer.update({ where: { id: healer.id }, data: { availability: parsed.data }, select: { availability: true } })
      return NextResponse.json({ success: true, data: parsed.data, version: version(healer.id, updated.availability) }, { headers: privateHeaders })
    }, { maxWait: 10000, timeout: 10000 })
  } catch (error) { return failure(error, 'PUT') }
}
