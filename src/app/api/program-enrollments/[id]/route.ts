import { NextResponse } from 'next/server'
import { changeProgramEnrollment, getProgramEnrollment, programAction, programActor, ProgramAccessError } from '@/lib/programs/enrollments'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Context = { params: Promise<{ id: string }> }
function failure(error: unknown) {
  if (error instanceof ProgramAccessError) return NextResponse.json({ error: error.message }, { status: error.status })
  console.error('[programs][sessions][failed]')
  return NextResponse.json({ error: 'Could not update program enrollment' }, { status: 500 })
}
export async function GET(_req: Request, context: Context) {
  try {
    return NextResponse.json({ data: await getProgramEnrollment(await programActor(), (await context.params).id) }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return failure(error) }
}
export async function PATCH(req: Request, context: Context) {
  try {
    const actor = await programActor()
    const parsed = programAction.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid program action', issues: parsed.error.issues }, { status: 400 })
    return NextResponse.json(await changeProgramEnrollment(actor, (await context.params).id, parsed.data), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return failure(error) }
}
