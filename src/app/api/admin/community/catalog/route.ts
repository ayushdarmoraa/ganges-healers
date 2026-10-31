import { NextRequest, NextResponse } from 'next/server'
import { requireCommunityAdmin } from '@/lib/community/admin'
import { catalogQuerySchema, CommunityCatalogError, createCatalogSchema, createCommunityCatalog, listCommunityCatalog, updateCatalogSchema, updateCommunityCatalog } from '@/lib/community/catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function failure(error: unknown) {
  if (error instanceof CommunityCatalogError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status })
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  if (status === 401 || status === 403) return NextResponse.json({ error: 'Forbidden' }, { status })
  console.error('[community][catalog][error]', { type: error instanceof Error ? error.name : 'unknown' })
  return NextResponse.json({ error: 'Community catalog is temporarily unavailable' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    await requireCommunityAdmin()
    const parsed = catalogQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid catalog filters' }, { status: 400 })
    return NextResponse.json({ success: true, ...await listCommunityCatalog(parsed.data) })
  } catch (error) { return failure(error) }
}

async function mutate(request: NextRequest, create: boolean) {
  try {
    const actor = await requireCommunityAdmin()
    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    if (create) {
      const parsed = createCatalogSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: 'Check the catalog fields', details: parsed.error.flatten().fieldErrors }, { status: 400 })
      return NextResponse.json({ success: true, ...await createCommunityCatalog(actor.id, parsed.data) }, { status: 201 })
    }
    const parsed = updateCatalogSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Valid changes and the current item version are required', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    return NextResponse.json({ success: true, ...await updateCommunityCatalog(actor.id, parsed.data) })
  } catch (error) { return failure(error) }
}

export const POST = (request: NextRequest) => mutate(request, true)
export const PATCH = (request: NextRequest) => mutate(request, false)
