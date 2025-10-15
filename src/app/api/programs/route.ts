import { NextRequest, NextResponse } from 'next/server'
import { listPrograms } from '@/lib/programs/queries'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') || undefined
  const serviceSlug = searchParams.get('serviceSlug') || undefined
  const limit = Number(searchParams.get('limit') || '')
  const cursor = searchParams.get('cursor') || undefined

  try {
    const data = await listPrograms({ q, serviceSlug, limit: Number.isFinite(limit) ? limit : undefined, cursor })
    return NextResponse.json(data)
  } catch (e) {
    console.error('[programs][list][error]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
