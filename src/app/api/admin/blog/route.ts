import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { BlogAdminError, blogAdminQuerySchema, createBlogDraft, createBlogSchema, listBlogArticles, updateBlogArticle, updateBlogSchema } from '@/lib/blog/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

function failure(error: unknown) {
  if (error instanceof BlogAdminError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status, headers })
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  if (status === 401 || status === 403) return NextResponse.json({ error: 'Forbidden' }, { status, headers })
  console.error('[blog][admin][error]', { type: error instanceof Error ? error.name : 'unknown' })
  return NextResponse.json({ error: 'Article management is temporarily unavailable' }, { status: 500, headers })
}

export async function GET(request: NextRequest) {
  try {
    await requireCurrentAdmin()
    const parsed = blogAdminQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid article filters' }, { status: 400, headers })
    return NextResponse.json({ success: true, ...await listBlogArticles(parsed.data) }, { headers })
  } catch (error) { return failure(error) }
}

async function write(request: NextRequest, create: boolean) {
  try {
    const actor = await requireCurrentAdmin()
    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers }) }
    if (create) {
      const parsed = createBlogSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: 'Check the article fields', details: parsed.error.flatten().fieldErrors }, { status: 400, headers })
      return NextResponse.json({ success: true, ...await createBlogDraft(actor.id, parsed.data) }, { status: 201, headers })
    }
    const parsed = updateBlogSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Valid changes and the saved article version are required', details: parsed.error.flatten().fieldErrors }, { status: 400, headers })
    return NextResponse.json({ success: true, ...await updateBlogArticle(actor.id, parsed.data) }, { headers })
  } catch (error) { return failure(error) }
}

export const POST = (request: NextRequest) => write(request, true)
export const PATCH = (request: NextRequest) => write(request, false)
