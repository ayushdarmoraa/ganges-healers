import { NextResponse } from 'next/server'
import { listProgramEnrollments, programActor, ProgramAccessError } from '@/lib/programs/enrollments'
import { z } from 'zod'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const query = z.object({ scope: z.enum(['mine', 'healer', 'admin']).default('mine'), page: z.coerce.number().int().min(1).max(1000).default(1) })
export async function GET(req: Request) {
  try {
    const actor = await programActor()
    const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid scope or page' }, { status: 400 })
    return NextResponse.json(await listProgramEnrollments(actor, parsed.data.scope, parsed.data.page), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof ProgramAccessError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[programs][enrollments][list_failed]')
    return NextResponse.json({ error: 'Could not load programs' }, { status: 500 })
  }
}
