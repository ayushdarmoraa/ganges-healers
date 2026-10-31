import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireCommunityAdmin } from '@/lib/community/admin'
import { CommunityModerationError, getCommunityTargets, moderateCommunity } from '@/lib/community/moderation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const querySchema = z.object({
  view: z.enum(['reports', 'content', 'metrics']).default('reports'),
  status: z.enum(['pending', 'reviewed', 'dismissed', 'all']).default('pending'),
  type: z.enum(['post', 'comment', 'all']).default('all'),
  visibility: z.enum(['visible', 'hidden', 'all']).default('visible'),
  q: z.string().trim().max(200).default(''),
  cursor: z.string().min(1).optional(),
})
type Query = z.infer<typeof querySchema> & { limit: number }

function failure(error: unknown) {
  if (error instanceof CommunityModerationError) return NextResponse.json({ error: error.message }, { status: error.status })
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  if (status === 401 || status === 403) return NextResponse.json({ error: 'Forbidden' }, { status })
  console.error('Community moderation error:', { type: error instanceof Error ? error.name : 'unknown' })
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

// Existing reports and metrics views remain; content browsing and cursors are additive.
export async function GET(request: NextRequest) {
  try {
    await requireCommunityAdmin()
    const params = new URL(request.url).searchParams
    const parsed = querySchema.safeParse(Object.fromEntries(params))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid moderation filters' }, { status: 400 })
    const requested = Number(params.get('limit'))
    const limit = Number.isFinite(requested) && requested >= 1 ? Math.min(200, Math.floor(requested)) : 50
    const query = { ...parsed.data, limit }
    if (query.view === 'metrics') return await getMetrics()
    if (query.view === 'content') return await getContent(query)
    return await getReports(query)
  } catch (error) { return failure(error) }
}

async function getReports(query: Query) {
  const where: Prisma.CommunityReportWhereInput = {
    ...(query.status !== 'all' ? { status: query.status } : {}),
    ...(query.type !== 'all' ? { targetType: query.type } : {}),
    ...(query.q ? { OR: [
      { reason: { contains: query.q, mode: 'insensitive' } },
      { user: { name: { contains: query.q, mode: 'insensitive' } } },
      { targetId: { contains: query.q, mode: 'insensitive' } },
    ] } : {}),
  }
  const [reports, pending, reviewed, dismissed] = await Promise.all([
    prisma.communityReport.findMany({
      where, take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { user: { select: { id: true, name: true, email: true } }, reviewer: { select: { id: true, name: true } } },
    }),
    prisma.communityReport.count({ where: { status: 'pending' } }),
    prisma.communityReport.count({ where: { status: 'reviewed' } }),
    prisma.communityReport.count({ where: { status: 'dismissed' } }),
  ])
  const hasMore = reports.length > query.limit
  if (hasMore) reports.pop()
  const [posts, comments] = await Promise.all([
    getCommunityTargets(prisma, 'post', reports.filter(report => report.targetType === 'post').map(report => report.targetId)),
    getCommunityTargets(prisma, 'comment', reports.filter(report => report.targetType === 'comment').map(report => report.targetId)),
  ])
  const targets = new Map<string, (typeof posts)[number]>([...posts, ...comments].map(target => [`${target.kind}:${target.id}`, target] as const))
  return NextResponse.json({
    success: true,
    data: reports.map(report => ({ ...report, target: targets.get(`${report.targetType}:${report.targetId}`) || null })),
    pendingCount: pending, counts: { pending, reviewed, dismissed },
    nextCursor: hasMore ? reports[reports.length - 1]?.id || null : null,
  })
}

async function getContent(query: Query) {
  const type = query.type === 'comment' ? 'comment' : 'post'
  const pagination = {
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    select: { id: true } as const,
  }
  const postWhere: Prisma.CommunityPostWhereInput = {
    ...(query.visibility === 'visible' ? { deletedAt: null } : query.visibility === 'hidden' ? { deletedAt: { not: null } } : {}),
    ...(query.q ? { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { content: { contains: query.q, mode: 'insensitive' } }] } : {}),
  }
  const commentWhere: Prisma.CommunityCommentWhereInput = {
    AND: [
      query.visibility === 'visible' ? { deletedAt: null, post: { deletedAt: null } } : query.visibility === 'hidden' ? { OR: [{ deletedAt: { not: null } }, { post: { deletedAt: { not: null } } }] } : {},
      ...(query.q ? [{ content: { contains: query.q, mode: 'insensitive' as const } }] : []),
    ],
  }
  const [rows, pendingCount] = await Promise.all([
    type === 'post' ? prisma.communityPost.findMany({ ...pagination, where: postWhere }) : prisma.communityComment.findMany({ ...pagination, where: commentWhere }),
    prisma.communityReport.count({ where: { status: 'pending' } }),
  ])
  const hasMore = rows.length > query.limit
  if (hasMore) rows.pop()
  const targets = await getCommunityTargets(prisma, type, rows.map(row => row.id))
  const byId = new Map(targets.map(target => [target.id, target]))
  return NextResponse.json({ success: true, data: rows.flatMap(row => { const target = byId.get(row.id); return target ? [target] : [] }), pendingCount, nextCursor: hasMore ? rows[rows.length - 1]?.id || null : null })
}

async function getMetrics() {
  const now = new Date()
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  const [
    totalPosts,
    postsToday,
    postsThisWeek,
    totalComments,
    commentsThisWeek,
    totalUsers,
    activeContributorsWeek,
    vipParticipants,
    hiddenPosts,
    hiddenComments,
    pendingReports,
  ] = await Promise.all([
    prisma.communityPost.count({ where: { deletedAt: null } }),
    prisma.communityPost.count({ where: { deletedAt: null, createdAt: { gte: dayAgo } } }),
    prisma.communityPost.count({ where: { deletedAt: null, createdAt: { gte: weekAgo } } }),
    prisma.communityComment.count({ where: { deletedAt: null, post: { deletedAt: null } } }),
    prisma.communityComment.count({ where: { deletedAt: null, post: { deletedAt: null }, createdAt: { gte: weekAgo } } }),
    prisma.user.count(),
    // Users who posted or commented in last 7 days
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT uid) as count FROM (
        SELECT "userId" as uid FROM "CommunityPost" WHERE "deletedAt" IS NULL AND "createdAt" >= ${weekAgo}
        UNION
        SELECT cc."userId" as uid FROM "CommunityComment" cc JOIN "CommunityPost" cp ON cp."id" = cc."postId" WHERE cc."deletedAt" IS NULL AND cp."deletedAt" IS NULL AND cc."createdAt" >= ${weekAgo}
      ) sub
    `,
    // VIP users who posted or commented ever
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT u."id") as count FROM "User" u
      WHERE u."vip" = true AND (
        EXISTS (SELECT 1 FROM "CommunityPost" cp WHERE cp."userId" = u."id" AND cp."deletedAt" IS NULL)
        OR EXISTS (SELECT 1 FROM "CommunityComment" cc JOIN "CommunityPost" cp ON cp."id" = cc."postId" WHERE cc."userId" = u."id" AND cc."deletedAt" IS NULL AND cp."deletedAt" IS NULL)
      )
    `,
    prisma.communityPost.count({ where: { deletedAt: { not: null } } }),
    prisma.communityComment.count({ where: { OR: [{ deletedAt: { not: null } }, { post: { deletedAt: { not: null } } }] } }),
    prisma.communityReport.count({ where: { status: 'pending' } }),
  ])

  // Average comments per post
  const avgComments = totalPosts > 0 ? (totalComments / totalPosts).toFixed(1) : '0'

  return NextResponse.json({
    success: true,
    data: {
      totalPosts,
      postsToday,
      postsThisWeek,
      totalComments,
      commentsThisWeek,
      avgCommentsPerPost: parseFloat(avgComments),
      totalUsers,
      activeContributorsThisWeek: Number(activeContributorsWeek[0]?.count ?? 0),
      vipParticipants: Number(vipParticipants[0]?.count ?? 0),
      hiddenPosts,
      hiddenComments,
      pendingReports,
    },
  })
}

const decisionSchema = z.object({
  action: z.enum(['reviewed', 'dismissed', 'resolve', 'hide', 'restore', 'pin', 'unpin']),
  reportId: z.string().min(1).optional(),
  targetType: z.enum(['post', 'comment']).optional(),
  targetId: z.string().min(1).optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).refine(value => value.reportId || (value.targetType && value.targetId))

export async function PATCH(request: NextRequest) {
  try {
    const actor = await requireCommunityAdmin()
    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
    const parsed = decisionSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Valid action and report or content target required' }, { status: 400 })
    const result = await moderateCommunity({ ...parsed.data, actorId: actor.id })
    return NextResponse.json({ success: true, ...result })
  } catch (error) { return failure(error) }
}
