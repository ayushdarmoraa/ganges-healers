import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { moderateCommunity, submitCommunityReport } from '@/lib/community/moderation'
import { GET as getPost } from '@/app/api/community/posts/[id]/route'
import { GET as getQueue, PATCH as decide } from '@/app/api/admin/community/route'
import { POST as comment } from '@/app/api/community/comments/route'
import { POST as like } from '@/app/api/community/likes/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/requireVIP', () => ({ requireVIP: jest.fn() }))
jest.mock('@/lib/community/admin', () => ({ requireCommunityAdmin: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/queues/jobs', () => ({ enqueueNotification: jest.fn().mockResolvedValue(undefined) }))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const vip = jest.requireMock<{ requireVIP: jest.Mock }>('@/lib/auth/requireVIP').requireVIP
const admin = jest.requireMock<{ requireCommunityAdmin: jest.Mock }>('@/lib/community/admin').requireCommunityAdmin
const users: string[] = []
let postId: string
let commentId: string
const token = crypto.randomUUID()
const request = (path: string, body?: object) => new NextRequest(`http://localhost${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
const readPost = () => getPost(request(`/api/community/posts/${postId}`), { params: Promise.resolve({ id: postId }) })
const report = (actorId = users[3], targetType: 'post' | 'comment' = 'post') => submitCommunityReport({ actorId, targetType, targetId: targetType === 'post' ? postId : commentId, reason: `Review this content ${token}` })
const decision = (action: 'hide' | 'restore' | 'pin' | 'unpin', targetType: 'post' | 'comment' = 'post') => moderateCommunity({ actorId: users[0], action, targetType, targetId: targetType === 'post' ? postId : commentId })

beforeAll(async () => {
  for (let index = 0; index < 5; index++) {
    const user = await prisma.user.create({ data: { email: `moderation-${crypto.randomUUID()}@example.test`, name: `Moderator fixture ${index}`, role: index < 2 ? 'ADMIN' : 'USER' } })
    users.push(user.id)
  }
})
beforeEach(async () => {
  postId = (await prisma.communityPost.create({ data: { userId: users[2], title: `Discussion ${token}`, content: `Full discussion ${token}` } })).id
  commentId = (await prisma.communityComment.create({ data: { userId: users[2], postId, content: `Reply ${token}` } })).id
  auth.mockResolvedValue({ user: { id: users[3] } })
  vip.mockResolvedValue({ user: { id: users[3] } })
  admin.mockResolvedValue({ id: users[0], role: 'ADMIN' })
})
afterAll(async () => {
  if (users.length) {
    await prisma.activityLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.communityReport.deleteMany({ where: { OR: [{ userId: { in: users } }, { reviewedBy: { in: users } }] } })
    await prisma.communityPost.deleteMany({ where: { userId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  }
  await prisma.$disconnect()
})

test('simultaneous duplicate reports create one report and one committed audit record', async () => {
  const results = await Promise.allSettled([report(), report()])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
  expect(await prisma.communityReport.count({ where: { targetId: postId } })).toBe(1)
  expect(await prisma.activityLog.count({ where: { entityId: postId, action: 'community_report_created' } })).toBe(1)
})

test('competing moderators apply one decision, close every pending target report, and audit once', async () => {
  const first = await report()
  await report(users[4])
  const outcomes = await Promise.allSettled(users.slice(0, 2).map(actorId => moderateCommunity({ actorId, reportId: first.id, action: 'reviewed' })))
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.find(outcome => outcome.status === 'rejected')).toMatchObject({ reason: { status: 409 } })
  const post = await prisma.communityPost.findUniqueOrThrow({ where: { id: postId } })
  expect(post.deletedAt).not.toBeNull()
  expect(users.slice(0, 2)).toContain(post.deletedById)
  const reports = await prisma.communityReport.findMany({ where: { targetId: postId } })
  expect(reports).toHaveLength(2)
  expect(reports.every(item => item.status === 'reviewed' && item.reviewedBy === post.deletedById && item.reviewedAt)).toBe(true)
  expect(await prisma.activityLog.count({ where: { action: 'community_report_reviewed', entityId: first.id } })).toBe(1)
})

test('hide and restore affect public visibility while preserving closed report history', async () => {
  const saved = await report()
  const response = await decide(request('/api/admin/community', { action: 'reviewed', reportId: saved.id }))
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({ id: saved.id, status: 'reviewed' })
  expect((await readPost()).status).toBe(404)
  await decision('restore')
  expect((await readPost()).status).toBe(200)
  expect(await prisma.communityReport.findUnique({ where: { id: saved.id } })).toMatchObject({ status: 'reviewed', reviewedBy: users[0] })
  expect(await prisma.activityLog.count({ where: { entityId: postId, action: 'community_post_restored' } })).toBe(1)
})

test('retrying an old successful decision after restore does not hide the content again', async () => {
  const saved = await report()
  await moderateCommunity({ actorId: users[0], action: 'reviewed', reportId: saved.id })
  await decision('restore')
  expect(await moderateCommunity({ actorId: users[0], action: 'reviewed', reportId: saved.id })).toMatchObject({ idempotent: true })
  expect((await readPost()).status).toBe(200)
})

test('author deletion remains in force when reports are reviewed and restoration is requested', async () => {
  const saved = await report()
  await prisma.communityPost.update({ where: { id: postId }, data: { deletedAt: new Date(), deletedById: users[2] } })
  await moderateCommunity({ actorId: users[0], action: 'reviewed', reportId: saved.id })
  await expect(decision('restore')).rejects.toMatchObject({ status: 409 })
  expect(await prisma.communityPost.findUnique({ where: { id: postId } })).toMatchObject({ deletedById: users[2] })
})

test('restoring a parent does not revive independently hidden comments', async () => {
  await report(users[3], 'comment')
  await decision('hide', 'comment')
  await decision('hide')
  await expect(decision('restore', 'comment')).rejects.toMatchObject({ status: 409 })
  await decision('restore')
  expect((await (await readPost()).json()).data.comments).toEqual([])
  await decision('restore', 'comment')
  expect((await (await readPost()).json()).data.comments.map((item: { id: string }) => item.id)).toContain(commentId)
})

test('stale review versions fail without changing visibility or report status', async () => {
  const saved = await report()
  const before = await prisma.communityPost.findUniqueOrThrow({ where: { id: postId } })
  await prisma.communityPost.update({ where: { id: postId }, data: { content: 'Edited after review opened', updatedAt: new Date(before.updatedAt.getTime() + 1000) } })
  const response = await decide(request('/api/admin/community', { action: 'hide', reportId: saved.id, expectedUpdatedAt: before.updatedAt.toISOString() }))
  expect(response.status).toBe(409)
  expect(await prisma.communityPost.findUnique({ where: { id: postId } })).toMatchObject({ deletedAt: null })
  expect(await prisma.communityReport.findUnique({ where: { id: saved.id } })).toMatchObject({ status: 'pending' })
})

test('dismissing one report leaves another pending and keeps content visible', async () => {
  const saved = await report()
  const other = await report(users[4])
  await moderateCommunity({ actorId: users[0], action: 'dismissed', reportId: saved.id })
  expect(await prisma.communityReport.findUnique({ where: { id: other.id } })).toMatchObject({ status: 'pending' })
  expect((await readPost()).status).toBe(200)
})

test('members see only their own pending report state for posts and comments', async () => {
  await report()
  await report(users[3], 'comment')
  let body = await (await readPost()).json()
  expect(body.data.hasPendingReport).toBe(true)
  expect(body.data.comments[0].hasPendingReport).toBe(true)
  auth.mockResolvedValue({ user: { id: users[4] } })
  body = await (await readPost()).json()
  expect(body.data.hasPendingReport).toBe(false)
  expect(body.data.comments[0].hasPendingReport).toBe(false)
  expect(body.data).not.toHaveProperty('reports')
})

test('pinning changes the stored order flag and rejects hidden discussions', async () => {
  await decision('pin')
  expect(await prisma.communityPost.findUnique({ where: { id: postId } })).toMatchObject({ isPinned: true })
  await decision('unpin')
  await decision('hide')
  await expect(decision('pin')).rejects.toMatchObject({ status: 409 })
})

test('hidden discussions reject new likes and comments after the visibility lock', async () => {
  await decision('hide')
  expect((await like(request('/api/community/likes', { postId }))).status).toBe(404)
  expect((await comment(request('/api/community/comments', { postId, content: 'Should not be saved' }))).status).toBe(404)
  expect(await prisma.communityLike.count({ where: { postId } })).toBe(0)
  expect(await prisma.communityComment.count({ where: { postId } })).toBe(1)
})

test('the admin queue hydrates full targets and paginates without repeating reports', async () => {
  await report()
  await report(users[4])
  const prefix = `/api/admin/community?status=pending&q=${postId}&limit=1`
  const first = await (await getQueue(request(prefix))).json()
  expect(first.data).toHaveLength(1)
  expect(first.data[0].target).toMatchObject({ id: postId, content: `Full discussion ${token}`, kind: 'post' })
  expect(first.nextCursor).toBeTruthy()
  const second = await (await getQueue(request(`${prefix}&cursor=${first.nextCursor}`))).json()
  expect(second.data).toHaveLength(1)
  expect(second.data[0].id).not.toBe(first.data[0].id)
  expect(second.nextCursor).toBeNull()
})

test('hidden content browsing includes comments below hidden parents; metrics execute against PostgreSQL', async () => {
  await decision('hide')
  const content = await (await getQueue(request(`/api/admin/community?view=content&type=comment&visibility=hidden&q=${token}`))).json()
  expect(content.data.find((item: { id: string }) => item.id === commentId)).toMatchObject({ parentHidden: true, deletedAt: null })
  const response = await getQueue(request('/api/admin/community?view=metrics'))
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({ hiddenPosts: expect.any(Number), hiddenComments: expect.any(Number), activeContributorsThisWeek: expect.any(Number), pendingReports: expect.any(Number) })
})
