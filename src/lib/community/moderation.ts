import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'

export type CommunityTargetType = 'post' | 'comment'
export type ModerationAction = 'reviewed' | 'dismissed' | 'resolve' | 'hide' | 'restore' | 'pin' | 'unpin'

export class CommunityModerationError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'CommunityModerationError' }
}

const postFields = {
  id: true, title: true, content: true, userId: true, createdAt: true, updatedAt: true,
  deletedAt: true, deletedById: true, isPinned: true, user: { select: { name: true } },
} as const
const commentFields = {
  id: true, content: true, userId: true, postId: true, createdAt: true, updatedAt: true,
  deletedAt: true, deletedById: true, user: { select: { name: true } },
  post: { select: { id: true, title: true, deletedAt: true } },
} as const

type Post = Prisma.CommunityPostGetPayload<{ select: typeof postFields }>
type Comment = Prisma.CommunityCommentGetPayload<{ select: typeof commentFields }>

function removalInfo(target: { deletedAt: Date | null; deletedById: string | null; userId: string }, parentHidden = false) {
  const removalType = !target.deletedAt ? null : !target.deletedById ? 'unknown' : target.deletedById === target.userId ? 'author' : 'moderation'
  return { removalType, canRestore: removalType === 'moderation' && !parentHidden, parentHidden }
}

function postTarget(post: Post) {
  return { ...post, kind: 'post' as const, postId: post.id, postTitle: post.title, ...removalInfo(post) }
}

function commentTarget(comment: Comment) {
  const { post, ...rest } = comment
  return { ...rest, kind: 'comment' as const, title: null, isPinned: false, postTitle: post.title, ...removalInfo(comment, !!post.deletedAt) }
}

/** Batch hydration keeps the moderation queue from issuing a query per report. */
export async function getCommunityTargets(tx: Prisma.TransactionClient, type: CommunityTargetType, ids: string[]) {
  if (!ids.length) return []
  return type === 'post'
    ? (await tx.communityPost.findMany({ where: { id: { in: ids } }, select: postFields })).map(postTarget)
    : (await tx.communityComment.findMany({ where: { id: { in: ids } }, select: commentFields })).map(commentTarget)
}

export async function getCommunityTarget(tx: Prisma.TransactionClient, type: CommunityTargetType, id: string) {
  if (type === 'post') {
    const post = await tx.communityPost.findUnique({ where: { id }, select: postFields })
    return post ? postTarget(post) : null
  }
  const comment = await tx.communityComment.findUnique({ where: { id }, select: commentFields })
  return comment ? commentTarget(comment) : null
}

/** Parent-first locks serialize report/decision writes and protect against concurrent SQL updates. */
async function lockCommunityTarget(tx: Prisma.TransactionClient, type: CommunityTargetType, id: string) {
  const parentId = type === 'post' ? id : (await tx.communityComment.findUnique({ where: { id }, select: { postId: true } }))?.postId
  if (parentId) {
    await lockTransaction(tx, 'community', `post:${parentId}`)
    await tx.$queryRaw`SELECT "id" FROM "CommunityPost" WHERE "id" = ${parentId} FOR UPDATE`
  }
  if (type === 'comment') {
    await lockTransaction(tx, 'community', `comment:${id}`)
    await tx.$queryRaw`SELECT "id" FROM "CommunityComment" WHERE "id" = ${id} FOR UPDATE`
  }
}

async function audit(tx: Prisma.TransactionClient, actorId: string, action: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}) {
  await tx.activityLog.create({ data: { userId: actorId, action, entityType, entityId, metadata } })
}

/** Member interactions use the same target ordering as moderation decisions. */
export function withCommunityTargetLock<T>(type: CommunityTargetType, id: string, operation: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(async tx => { await lockCommunityTarget(tx, type, id); return operation(tx) }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}

/** One pending report per member/target, including simultaneous submissions. */
export async function submitCommunityReport(input: { actorId: string; targetType: CommunityTargetType; targetId: string; reason: string }) {
  return prisma.$transaction(async tx => {
    const { actorId, targetType, targetId, reason } = input
    await lockCommunityTarget(tx, targetType, targetId)
    const target = await getCommunityTarget(tx, targetType, targetId)
    if (!target || target.deletedAt || target.parentHidden) throw new CommunityModerationError(targetType === 'post' ? 'Post not found' : 'Comment not found', 404)
    if (target.userId === actorId) throw new CommunityModerationError('You cannot report your own content', 400)
    const existing = await tx.communityReport.findFirst({ where: { userId: actorId, targetType, targetId, status: 'pending' } })
    if (existing) throw new CommunityModerationError('You have already reported this content', 409)
    const report = await tx.communityReport.create({ data: { userId: actorId, targetType, targetId, reason } })
    await audit(tx, actorId, 'community_report_created', `community_${targetType}`, targetId, { reportId: report.id })
    return report
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}

interface Decision {
  actorId: string
  action: ModerationAction
  reportId?: string
  targetType?: CommunityTargetType
  targetId?: string
  expectedUpdatedAt?: string
}

/** Content visibility, report resolution, and auditing commit as one decision. */
export async function moderateCommunity(input: Decision) {
  return prisma.$transaction(async tx => {
    let report = input.reportId ? await tx.communityReport.findUnique({ where: { id: input.reportId } }) : null
    if (input.reportId && !report) throw new CommunityModerationError('Report not found', 404)
    const targetType = report?.targetType || input.targetType
    const targetId = report?.targetId || input.targetId
    if ((targetType !== 'post' && targetType !== 'comment') || !targetId) throw new CommunityModerationError('A valid content target is required', 400)
    if (report && ((input.targetId && input.targetId !== report.targetId) || (input.targetType && input.targetType !== report.targetType))) throw new CommunityModerationError('Report target mismatch', 400)
    if (['reviewed', 'dismissed', 'resolve'].includes(input.action) && !report) throw new CommunityModerationError('reportId is required for this action', 400)

    await lockCommunityTarget(tx, targetType, targetId)
    if (report) {
      report = await tx.communityReport.findUnique({ where: { id: report.id } })
      if (!report) throw new CommunityModerationError('Report not found', 404)
      if (['reviewed', 'dismissed', 'resolve', 'hide'].includes(input.action) && report.status !== 'pending') {
        const wanted = input.action === 'dismissed' ? 'dismissed' : 'reviewed'
        if (report.status === wanted && report.reviewedBy === input.actorId) return { data: report, idempotent: true, resolvedCount: 0 }
        throw new CommunityModerationError('This report was already handled. Refresh the queue.', 409)
      }
    }

    const target = await getCommunityTarget(tx, targetType, targetId)
    if (input.expectedUpdatedAt && target && target.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) throw new CommunityModerationError('The content changed. Refresh before making a decision.', 409)
    const now = new Date()
    const { actorId, action } = input

    if (action === 'dismissed' || action === 'resolve') {
      const status = action === 'dismissed' ? 'dismissed' : 'reviewed'
      const changed = await tx.communityReport.updateMany({ where: { id: report!.id, status: 'pending' }, data: { status, reviewedBy: actorId, reviewedAt: now } })
      if (!changed.count) throw new CommunityModerationError('This report was already handled. Refresh the queue.', 409)
      const updated = await tx.communityReport.findUniqueOrThrow({ where: { id: report!.id } })
      await audit(tx, actorId, `community_report_${status}`, 'community_report', updated.id, { targetType, targetId, visibilityChanged: false })
      return { data: updated, idempotent: false, resolvedCount: 1 }
    }

    if (!target) throw new CommunityModerationError('Content not found', 404)
    if (action === 'reviewed' || action === 'hide') {
      let changed = false
      if (!target.deletedAt) {
        const where = { id: targetId, deletedAt: null, updatedAt: target.updatedAt }
        const data = { deletedAt: now, deletedById: actorId }
        const updated = targetType === 'post' ? await tx.communityPost.updateMany({ where, data }) : await tx.communityComment.updateMany({ where, data })
        if (!updated.count) throw new CommunityModerationError('The content changed. Refresh before making a decision.', 409)
        changed = true
      }
      const resolved = await tx.communityReport.updateMany({ where: { targetType, targetId, status: 'pending' }, data: { status: 'reviewed', reviewedBy: actorId, reviewedAt: now } })
      if (changed || resolved.count) await audit(tx, actorId, report ? 'community_report_reviewed' : `community_${targetType}_hidden`, report ? 'community_report' : `community_${targetType}`, report?.id || targetId, { targetType, targetId, resolvedCount: resolved.count, visibilityChanged: changed })
      return { data: report ? await tx.communityReport.findUniqueOrThrow({ where: { id: report.id } }) : await getCommunityTarget(tx, targetType, targetId), idempotent: !changed && !resolved.count, resolvedCount: resolved.count }
    }

    if (action === 'restore') {
      if (!target.deletedAt) return { data: target, idempotent: true, resolvedCount: 0 }
      if (!target.canRestore) throw new CommunityModerationError(target.parentHidden ? 'Restore the parent discussion before this comment.' : 'Author-deleted content or content with unknown removal history cannot be restored.', 409)
      if (await tx.communityReport.count({ where: { targetType, targetId, status: 'pending' } })) throw new CommunityModerationError('Resolve the pending reports for this content before restoring it.', 409)
      const where = { id: targetId, deletedAt: target.deletedAt, deletedById: target.deletedById, updatedAt: target.updatedAt }
      const data = { deletedAt: null, deletedById: null }
      const updated = targetType === 'post' ? await tx.communityPost.updateMany({ where, data }) : await tx.communityComment.updateMany({ where, data })
      if (!updated.count) throw new CommunityModerationError('The content changed. Refresh before restoring it.', 409)
      await audit(tx, actorId, `community_${targetType}_restored`, `community_${targetType}`, targetId)
      return { data: await getCommunityTarget(tx, targetType, targetId), idempotent: false, resolvedCount: 0 }
    }

    if (targetType !== 'post') throw new CommunityModerationError('Only discussions can be pinned', 400)
    const isPinned = action === 'pin'
    if (isPinned && target.deletedAt) throw new CommunityModerationError('Hidden discussions cannot be pinned', 409)
    if (target.isPinned === isPinned) return { data: target, idempotent: true, resolvedCount: 0 }
    const updated = await tx.communityPost.updateMany({ where: { id: targetId, updatedAt: target.updatedAt }, data: { isPinned } })
    if (!updated.count) throw new CommunityModerationError('The content changed. Refresh before changing its pin.', 409)
    await audit(tx, actorId, `community_post_${isPinned ? 'pinned' : 'unpinned'}`, 'community_post', targetId)
    return { data: await getCommunityTarget(tx, targetType, targetId), idempotent: false, resolvedCount: 0 }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
