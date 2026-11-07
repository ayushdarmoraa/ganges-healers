import { NextResponse } from 'next/server'
import { getPublishedBlogPost } from '@/lib/blog/queries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const post = await getPublishedBlogPost(slug)

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json(post, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[blog][detail][error]', err)
    return NextResponse.json({ error: 'Failed to fetch blog post' }, { status: 500 })
  }
}
