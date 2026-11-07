import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { AudioAdminError, changeManagedAudio, createManagedAudio, listManagedAudio } from '@/lib/audio/admin'
import { audioQuerySchema, changeAudioSchema, createAudioSchema } from '@/lib/audio/admin-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
function failure(error: unknown) {
  if (error instanceof AudioAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers })
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  if (status === 401 || status === 403) return NextResponse.json({ error: 'Forbidden' }, { status, headers })
  console.error('[audio][admin][error]', { type: error instanceof Error ? error.name : 'unknown' })
  return NextResponse.json({ error: 'Audio management is temporarily unavailable' }, { status: 500, headers })
}
export async function GET(request: NextRequest) {
  try {
    await requireCurrentAdmin()
    const params = new URL(request.url).searchParams
    const parsed = audioQuerySchema.safeParse(Object.fromEntries(params))
    if (!parsed.success || [...params.keys()].some(key => params.getAll(key).length !== 1)) return NextResponse.json({ error: 'Invalid audio filters' }, { status: 400, headers })
    return NextResponse.json({ success: true, ...await listManagedAudio(parsed.data) }, { headers })
  } catch (error) { return failure(error) }
}
async function write(request: NextRequest, method: 'POST' | 'PATCH') {
  try {
    const actor = await requireCurrentAdmin()
    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers }) }
    if (method === 'POST') {
      const parsed = createAudioSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the audio fields' }, { status: 400, headers })
      return NextResponse.json({ success: true, ...await createManagedAudio(actor.id, parsed.data) }, { status: 201, headers })
    }
    const parsed = changeAudioSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Valid changes and the saved version are required' }, { status: 400, headers })
    return NextResponse.json({ success: true, ...await changeManagedAudio(actor.id, parsed.data) }, { headers })
  } catch (error) { return failure(error) }
}
export const POST = (request: NextRequest) => write(request, 'POST')
export const PATCH = (request: NextRequest) => write(request, 'PATCH')
