import { NextResponse } from 'next/server'
import { listProducts } from '@/lib/store/queries'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const categorySlug = searchParams.get('categorySlug') || undefined
  const q = searchParams.get('q') || undefined
  const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : undefined
  const cursor = searchParams.get('cursor') || undefined

  const { items, nextCursor } = await listProducts({ categorySlug, q, limit, cursor })
  return NextResponse.json({ items, nextCursor })
}
