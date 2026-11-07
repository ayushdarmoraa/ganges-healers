import { CommunityModerationError, moderateCommunity, submitCommunityReport } from '@/lib/community/moderation'

jest.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: jest.fn(), $executeRaw: jest.fn(), $queryRaw: jest.fn(),
  communityPost: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  communityComment: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  communityReport: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
  activityLog: { create: jest.fn() },
} }))
type Database = Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock; $executeRaw: jest.Mock; $queryRaw: jest.Mock }
const db = jest.requireMock<{ prisma: Database }>('@/lib/prisma').prisma
const time = new Date('2026-10-01T12:00:00Z')
const post = { id: 'post', title: 'Discussion', content: 'Content', userId: 'author', createdAt: time, updatedAt: time, deletedAt: null, deletedById: null, isPinned: false, user: { name: 'Author' } }
const comment = { id: 'comment', postId: 'post', content: 'Comment', userId: 'author', createdAt: time, updatedAt: time, deletedAt: null, deletedById: null, user: { name: 'Author' }, post: { id: 'post', title: 'Discussion', deletedAt: null } }
const report = { id: 'report', userId: 'reporter', targetType: 'post', targetId: 'post', status: 'pending', reviewedBy: null, reviewedAt: null }
const decision = { actorId: 'admin', targetType: 'post' as const, targetId: 'post' }

beforeEach(() => {
  jest.resetAllMocks()
  db.$transaction.mockImplementation(async (operation: (tx: Database) => Promise<unknown>) => operation(db))
  db.$executeRaw.mockResolvedValue(1)
  db.$queryRaw.mockResolvedValue([])
  db.communityPost.findUnique.mockResolvedValue(post)
  db.communityComment.findUnique.mockResolvedValue(comment)
  db.communityReport.findUnique.mockResolvedValue(report)
  db.communityReport.findUniqueOrThrow.mockResolvedValue({ ...report, status: 'reviewed', reviewedBy: 'admin' })
  db.communityReport.findFirst.mockResolvedValue(null)
  db.communityReport.create.mockResolvedValue(report)
  db.communityReport.count.mockResolvedValue(0)
  db.communityPost.updateMany.mockResolvedValue({ count: 1 })
  db.communityComment.updateMany.mockResolvedValue({ count: 1 })
  db.communityReport.updateMany.mockResolvedValue({ count: 1 })
  db.activityLog.create.mockResolvedValue({})
})

test('a pending duplicate report is rejected without another write', async () => {
  db.communityReport.findFirst.mockResolvedValue(report)
  await expect(submitCommunityReport({ actorId: 'reporter', targetType: 'post', targetId: 'post', reason: 'A reason' })).rejects.toMatchObject({ status: 409 })
  expect(db.communityReport.create).not.toHaveBeenCalled()
  expect(db.activityLog.create).not.toHaveBeenCalled()
})

test('members cannot report their own content', async () => {
  await expect(submitCommunityReport({ actorId: 'author', targetType: 'post', targetId: 'post', reason: 'A reason' })).rejects.toMatchObject({ status: 400 })
  expect(db.communityReport.create).not.toHaveBeenCalled()
})

test('comments below hidden discussions cannot be reported', async () => {
  db.communityComment.findUnique.mockResolvedValue({ ...comment, post: { ...comment.post, deletedAt: time } })
  await expect(submitCommunityReport({ actorId: 'reporter', targetType: 'comment', targetId: 'comment', reason: 'A reason' })).rejects.toMatchObject({ status: 404 })
  expect(db.communityReport.create).not.toHaveBeenCalled()
})

test('stale content versions cannot be moderated', async () => {
  await expect(moderateCommunity({ ...decision, action: 'hide', expectedUpdatedAt: '2026-09-01T12:00:00Z' })).rejects.toMatchObject({ status: 409 })
  expect(db.communityPost.updateMany).not.toHaveBeenCalled()
  expect(db.communityReport.updateMany).not.toHaveBeenCalled()
})

test.each(['author', null])('restoration rejects author/unknown removal history: %s', async deletedById => {
  db.communityPost.findUnique.mockResolvedValue({ ...post, deletedAt: time, deletedById })
  await expect(moderateCommunity({ ...decision, action: 'restore' })).rejects.toMatchObject({ status: 409 })
  expect(db.communityPost.updateMany).not.toHaveBeenCalled()
})

test('a hidden parent prevents comment restoration', async () => {
  db.communityComment.findUnique.mockResolvedValue({ ...comment, deletedAt: time, deletedById: 'admin', post: { ...comment.post, deletedAt: time } })
  await expect(moderateCommunity({ actorId: 'admin', targetType: 'comment', targetId: 'comment', action: 'restore' })).rejects.toMatchObject({ status: 409 })
  expect(db.communityComment.updateMany).not.toHaveBeenCalled()
})

test('pending reports must be closed before a legacy moderation removal is restored', async () => {
  db.communityPost.findUnique.mockResolvedValue({ ...post, deletedAt: time, deletedById: 'admin' })
  db.communityReport.count.mockResolvedValue(2)
  await expect(moderateCommunity({ ...decision, action: 'restore' })).rejects.toMatchObject({ status: 409 })
})

test('another moderator’s completed decision is a conflict', async () => {
  db.communityReport.findUnique.mockResolvedValue({ ...report, status: 'reviewed', reviewedBy: 'other-admin' })
  await expect(moderateCommunity({ actorId: 'admin', reportId: 'report', action: 'reviewed' })).rejects.toMatchObject({ status: 409 })
  expect(db.communityPost.updateMany).not.toHaveBeenCalled()
})

test('a retry by the same moderator returns the saved result without hiding again', async () => {
  db.communityReport.findUnique.mockResolvedValue({ ...report, status: 'reviewed', reviewedBy: 'admin' })
  expect(await moderateCommunity({ actorId: 'admin', reportId: 'report', action: 'reviewed' })).toMatchObject({ idempotent: true })
  expect(db.communityPost.updateMany).not.toHaveBeenCalled()
  expect(db.activityLog.create).not.toHaveBeenCalled()
})

test('closing reports for already removed content preserves its removal actor', async () => {
  db.communityPost.findUnique.mockResolvedValue({ ...post, deletedAt: time, deletedById: 'author' })
  await moderateCommunity({ actorId: 'admin', reportId: 'report', action: 'reviewed' })
  expect(db.communityPost.updateMany).not.toHaveBeenCalled()
  expect(db.communityReport.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { targetType: 'post', targetId: 'post', status: 'pending' } }))
})

test('a report cannot be redirected to another content target', async () => {
  await expect(moderateCommunity({ ...decision, targetId: 'different', reportId: 'report', action: 'reviewed' })).rejects.toBeInstanceOf(CommunityModerationError)
  expect(db.communityPost.updateMany).not.toHaveBeenCalled()
})

test('audit failure is allowed to fail the same transaction rather than claiming success', async () => {
  db.activityLog.create.mockRejectedValue(new Error('Audit write failed'))
  await expect(moderateCommunity({ ...decision, action: 'hide' })).rejects.toThrow('Audit write failed')
  expect(db.$transaction).toHaveBeenCalledTimes(1)
})
