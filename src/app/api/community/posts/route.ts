import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireVIP } from '@/lib/auth/requireVIP'
import { z } from 'zod'
import { logActivity } from '@/lib/activity-log'
import { Prisma } from '@prisma/client'

// GET /api/community/posts — list posts with pagination, filtering, sorting, search (auth required)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const cursor = searchParams.get('cursor') ?? undefined
    const take = Math.min(Number(searchParams.get('take')) || 20, 50)
    const topicId = searchParams.get('topicId') ?? undefined
    const tagId = searchParams.get('tagId') ?? undefined
    const sort = searchParams.get('sort') ?? 'latest'
    const search = searchParams.get('search')?.trim() ?? undefined

    // Build where clause (always exclude soft-deleted)
    const where: Prisma.CommunityPostWhereInput = {
      deletedAt: null,
      ...(topicId ? { topicId } : {}),
      ...(tagId ? { tags: { some: { tagId } } } : {}),
    }

    // Full-text search: use raw SQL to get matching post IDs via tsvector
    if (search) {
      const sanitized = search.replace(/[&|!():*<>'"\\]/g, ' ').trim()
      if (sanitized) {
        const tsquery = sanitized.split(/\s+/).filter(Boolean).join(' & ')
        const matchingIds: { id: string }[] = await prisma.$queryRawUnsafe(
          `SELECT "id" FROM "CommunityPost" WHERE "deletedAt" IS NULL AND "searchVector" @@ to_tsquery('english', $1) LIMIT 200`,
          tsquery,
        )
        where.id = { in: matchingIds.map((r) => r.id) }
      }
    }

    // Determine ordering
    let orderBy: Prisma.CommunityPostOrderByWithRelationInput[]
    switch (sort) {
      case 'most_liked':
        orderBy = [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }]
        break
      case 'most_commented':
        orderBy = [{ comments: { _count: 'desc' } }, { createdAt: 'desc' }]
        break
      default: // 'latest'
        orderBy = [{ createdAt: 'desc' }]
    }

    const postInclude = {
      user: { select: { id: true, name: true, image: true } },
      topic: { select: { id: true, slug: true, name: true } },
      tags: { include: { tag: { select: { id: true, slug: true, name: true } } } },
      _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
    } as const

    // Fetch pinned posts separately (only on first page, no cursor, default sort, no search)
    type PostWithIncludes = Prisma.CommunityPostGetPayload<{ include: typeof postInclude }>
    let pinnedPosts: PostWithIncludes[] = []
    if (!cursor && sort === 'latest' && !search) {
      pinnedPosts = await prisma.communityPost.findMany({
        where: { ...where, isPinned: true },
        orderBy: [{ createdAt: 'desc' }],
        include: postInclude,
      })
    }

    const pinnedIds = pinnedPosts.map((p) => p.id)

    const posts = await prisma.communityPost.findMany({
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      where: {
        ...where,
        ...(pinnedIds.length > 0 ? { id: { notIn: pinnedIds } } : {}),
      },
      orderBy,
      include: postInclude,
    })

    const hasMore = posts.length > take
    if (hasMore) posts.pop()

    const nextCursor = hasMore ? posts[posts.length - 1]?.id : null

    // Combine pinned + regular for first page
    const allPosts = cursor ? posts : [...pinnedPosts, ...posts]

    return NextResponse.json({
      success: true,
      data: allPosts,
      nextCursor,
    })
  } catch (error) {
    console.error('Community posts GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const createPostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(5000),
  topicId: z.string().optional(),
  tagIds: z.array(z.string()).max(5).optional(),
})

// POST /api/community/posts — create post (VIP only)
export async function POST(request: NextRequest) {
  try {
    const session = await requireVIP()

    const body = await request.json()
    const parsed = createPostSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const topicId = parsed.data.topicId || undefined
    if (topicId) {
      const topic = await prisma.communityTopic.findFirst({
        where: { id: topicId, isActive: true },
        select: { id: true },
      })
      if (!topic) {
        return NextResponse.json({
          error: 'This topic is no longer available. Please choose another topic.',
          code: 'TOPIC_UNAVAILABLE',
        }, { status: 400 })
      }
    }

    const post = await prisma.communityPost.create({
      data: {
        userId: session.user!.id,
        title: parsed.data.title,
        content: parsed.data.content,
        topicId,
        ...(parsed.data.tagIds?.length
          ? { tags: { create: parsed.data.tagIds.map((tagId) => ({ tagId })) } }
          : {}),
      },
      include: {
        user: { select: { id: true, name: true, image: true } },
        topic: { select: { id: true, slug: true, name: true } },
        tags: { include: { tag: { select: { id: true, slug: true, name: true } } } },
        _count: { select: { comments: { where: { deletedAt: null } }, likes: true } },
      },
    })

    logActivity({ userId: session.user!.id, action: 'community_post_created', entityType: 'community_post', entityId: post.id })
    return NextResponse.json({ success: true, data: post }, { status: 201 })
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json({ error: (error as Error).message }, { status })
    }
    console.error('Community posts POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
