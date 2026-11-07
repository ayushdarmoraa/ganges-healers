import { NextResponse } from 'next/server'
import { getPublishedBlogSummaries } from '@/lib/blog/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const posts = await getPublishedBlogSummaries()

    return NextResponse.json(posts, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[blog][list][error]', err)
    return NextResponse.json({ error: 'Failed to fetch blog posts' }, { status: 500 })
  }
}
