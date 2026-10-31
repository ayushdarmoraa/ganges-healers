import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { requireVIP } from '@/lib/auth/requireVIP'
import { z } from 'zod'
import { logActivity } from '@/lib/activity-log'
import { enqueueNotification } from '@/lib/queues/jobs'
import { CommunityModerationError, withCommunityTargetLock } from '@/lib/community/moderation'

const commentSchema = z.object({
  postId: z.string().min(1),
  content: z.string().min(1).max(2000),
})

// POST /api/community/comments — create comment (VIP only) + notify post author
export async function POST(request: NextRequest) {
  try {
    const session = await requireVIP()
    const userId = session.user!.id

    const body = await request.json()
    const parsed = commentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    // Serialize the active-parent check and comment write with moderation.
    const { post, comment } = await withCommunityTargetLock('post', parsed.data.postId, async tx => {
      const post = await tx.communityPost.findUnique({
        where: { id: parsed.data.postId, deletedAt: null },
        select: { id: true, userId: true, title: true },
      })
      if (!post) {
        throw new CommunityModerationError('Post not found', 404)
      }

      const comment = await tx.communityComment.create({
        data: {
          postId: parsed.data.postId,
          userId,
          content: parsed.data.content,
        },
        include: {
          user: { select: { id: true, name: true, image: true } },
        },
      })
      return { post, comment }
    })

    // Notify post author (if not commenting on own post)
    if (post.userId !== userId) {
      const commenterName = comment.user.name || 'Someone'
      const titlePreview = post.title.length > 40 ? post.title.slice(0, 40) + '…' : post.title
      await enqueueNotification({
        userId: post.userId,
        type: 'community_comment',
        title: 'New comment on your post',
        message: `${commenterName} commented on "${titlePreview}"`,
      }).catch(() => console.warn('[community][comment_notification_failed]', { commentId: comment.id }))
    }

    logActivity({ userId, action: 'community_comment_created', entityType: 'community_comment', entityId: comment.id })
    return NextResponse.json({ success: true, data: comment }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof CommunityModerationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: (error as Error).message }, { status })
    }
    console.error('Community comment POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const updateCommentSchema = z.object({
  commentId: z.string().min(1),
  content: z.string().min(1).max(2000),
})

// PATCH /api/community/comments — edit own comment
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = updateCommentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const comment = await prisma.communityComment.findUnique({
      where: { id: parsed.data.commentId, deletedAt: null },
      select: { userId: true },
    })
    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }
    if (comment.userId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updated = await prisma.communityComment.update({
      where: { id: parsed.data.commentId },
      data: { content: parsed.data.content },
      include: {
        user: { select: { id: true, name: true, image: true } },
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error) {
    console.error('Community comment PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const deleteCommentSchema = z.object({
  commentId: z.string().min(1),
})

// DELETE /api/community/comments — soft-delete own comment (or admin)
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = deleteCommentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const comment = await prisma.communityComment.findUnique({
      where: { id: parsed.data.commentId, deletedAt: null },
      select: { userId: true },
    })
    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    // Allow author or admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })
    if (comment.userId !== session.user.id && user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await prisma.communityComment.update({
      where: { id: parsed.data.commentId },
      data: { deletedAt: new Date(), deletedById: session.user.id },
    })

    logActivity({ userId: session.user.id, action: 'community_comment_deleted', entityType: 'community_comment', entityId: parsed.data.commentId })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Community comment DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
