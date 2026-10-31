import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { logActivity } from '@/lib/activity-log'

// GET /api/community/posts/[id] — fetch single post with comments
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const post = await prisma.communityPost.findUnique({
      where: { id, deletedAt: null },
      include: {
        user: { select: { id: true, name: true, image: true } },
        topic: { select: { id: true, slug: true, name: true } },
        tags: { include: { tag: { select: { id: true, slug: true, name: true } } } },
        comments: {
          where: { deletedAt: null },
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { likes: true } },
      },
    })

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Check if current user has liked this post
    const userLike = await prisma.communityLike.findUnique({
      where: { postId_userId: { postId: id, userId: session.user.id } },
      select: { id: true },
    })

    const pendingReports = await prisma.communityReport.findMany({
      where: {
        userId: session.user.id, status: 'pending',
        OR: [
          { targetType: 'post', targetId: id },
          { targetType: 'comment', targetId: { in: post.comments.map(comment => comment.id) } },
        ],
      },
      select: { targetType: true, targetId: true },
    })
    const pending = new Set(pendingReports.map(report => `${report.targetType}:${report.targetId}`))

    return NextResponse.json({
      success: true,
      data: {
        ...post, liked: !!userLike, hasPendingReport: pending.has(`post:${id}`),
        comments: post.comments.map(comment => ({ ...comment, hasPendingReport: pending.has(`comment:${comment.id}`) })),
      },
    })
  } catch (error) {
    console.error('Community post GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const updatePostSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).max(5000).optional(),
})

// PATCH /api/community/posts/[id] — edit own post
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const post = await prisma.communityPost.findUnique({
      where: { id, deletedAt: null },
      select: { userId: true },
    })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }
    if (post.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = updatePostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const updated = await prisma.communityPost.update({
      where: { id },
      data: {
        ...(parsed.data.title ? { title: parsed.data.title } : {}),
        ...(parsed.data.content ? { content: parsed.data.content } : {}),
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        topic: { select: { id: true, slug: true, name: true } },
        tags: { include: { tag: { select: { id: true, slug: true, name: true } } } },
        _count: { select: { likes: true } },
      },
    })

    logActivity({ userId: session.user.id, action: 'community_post_edited', entityType: 'community_post', entityId: id })
    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Community post PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/community/posts/[id] — soft-delete own post (or admin delete)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const post = await prisma.communityPost.findUnique({
      where: { id, deletedAt: null },
      select: { userId: true },
    })
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 })
    }

    // Allow author or admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })
    if (post.userId !== session.user.id && user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.communityPost.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: session.user.id },
    })

    logActivity({ userId: session.user.id, action: 'community_post_deleted', entityType: 'community_post', entityId: id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Community post DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
