import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireVIP } from '@/lib/auth/requireVIP'
import { z } from 'zod'
import { enqueueNotification } from '@/lib/queues/jobs'
import { CommunityModerationError, withCommunityTargetLock } from '@/lib/community/moderation'

const likeSchema = z.object({
  postId: z.string().min(1),
})

// POST /api/community/likes — toggle like (VIP only) + notify post author
export async function POST(request: NextRequest) {
  try {
    const session = await requireVIP()

    const body = await request.json()
    const parsed = likeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const userId = session.user!.id
    const { postId } = parsed.data

    const result = await withCommunityTargetLock('post', postId, async tx => {
      const post = await tx.communityPost.findUnique({
        where: { id: postId, deletedAt: null },
        select: { id: true, userId: true, title: true },
      })
      if (!post) {
        throw new CommunityModerationError('Post not found', 404)
      }

      // Toggle: if already liked → unlike, else → like
      const existing = await tx.communityLike.findUnique({
        where: { postId_userId: { postId, userId } },
      })

      if (existing) {
        await tx.communityLike.delete({ where: { id: existing.id } })
        return { liked: false, post }
      }

      await tx.communityLike.create({
        data: { postId, userId },
      })
      return { liked: true, post }
    })
    if (!result.liked) return NextResponse.json({ success: true, liked: false })
    const { post } = result

    // Notify post author (if not liking own post)
    if (post.userId !== userId) {
      const liker = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      })
      const likerName = liker?.name || 'Someone'
      const titlePreview = post.title.length > 40 ? post.title.slice(0, 40) + '…' : post.title
      await enqueueNotification({
        userId: post.userId,
        type: 'community_like',
        title: 'Your post was liked',
        message: `${likerName} liked "${titlePreview}"`,
      }).catch(() => console.warn('[community][like_notification_failed]', { postId }))
    }

    return NextResponse.json({ success: true, liked: true })
  } catch (error: unknown) {
    if (error instanceof CommunityModerationError) return NextResponse.json({ error: error.message }, { status: error.status })
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: (error as Error).message }, { status })
    }
    console.error('Community like POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
