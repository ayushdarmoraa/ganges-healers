import { NextRequest } from 'next/server'
import { POST } from '@/app/api/community/posts/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/requireVIP', () => ({ requireVIP: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: jest.fn(), $queryRaw: jest.fn(),
  communityTopic: { findFirst: jest.fn() },
  communityPost: { create: jest.fn() },
  communityTag: { count: jest.fn() },
} }))

const vip = jest.requireMock<{ requireVIP: jest.Mock }>('@/lib/auth/requireVIP').requireVIP
const db = jest.requireMock<{ prisma: {
  $transaction: jest.Mock
  $queryRaw: jest.Mock
  communityTopic: { findFirst: jest.Mock }
  communityPost: { create: jest.Mock }
  communityTag: { count: jest.Mock }
} }>('@/lib/prisma').prisma
const request = (topicId?: string, tagIds?: string[]) => new NextRequest('http://localhost/api/community/posts', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'A discussion', content: 'A healing practice.', topicId, tagIds }),
})

beforeEach(() => {
  jest.resetAllMocks()
  db.$transaction.mockImplementation(async (operation: (tx: typeof db) => Promise<unknown>) => operation(db))
  db.$queryRaw.mockResolvedValue([])
  vip.mockResolvedValue({ user: { id: 'member' } })
  db.communityTopic.findFirst.mockResolvedValue({ id: 'active-topic' })
  db.communityPost.create.mockResolvedValue({ id: 'new-post' })
  db.communityTag.count.mockResolvedValue(1)
})

test('publishes to an active topic while preserving the response contract', async () => {
  const response = await POST(request('active-topic'))
  expect(response.status).toBe(201)
  expect(await response.json()).toEqual({ success: true, data: { id: 'new-post' } })
  expect(db.communityTopic.findFirst).toHaveBeenCalledWith({ where: { id: 'active-topic', isActive: true }, select: { id: true } })
  expect(db.communityPost.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 'member', topicId: 'active-topic' }) }))
})

test('rejects missing or inactive topics before creating a post', async () => {
  db.communityTopic.findFirst.mockResolvedValue(null)
  const response = await POST(request('unavailable-topic'))
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'TOPIC_UNAVAILABLE' })
  expect(db.communityPost.create).not.toHaveBeenCalled()
})

test('still permits posts without a topic', async () => {
  expect((await POST(request())).status).toBe(201)
  expect(db.communityTopic.findFirst).not.toHaveBeenCalled()
})

test('checks VIP access before looking up a topic or writing a post', async () => {
  vip.mockRejectedValue(Object.assign(new Error('VIP access required'), { status: 403 }))
  expect((await POST(request('active-topic'))).status).toBe(403)
  expect(db.communityTopic.findFirst).not.toHaveBeenCalled()
  expect(db.communityPost.create).not.toHaveBeenCalled()
})

test('unavailable tags cannot reach the post write', async () => {
  db.communityTag.count.mockResolvedValue(0)
  const response = await POST(request(undefined, ['missing-tag']))
  expect(response.status).toBe(400)
  expect(await response.json()).toMatchObject({ code: 'TAG_UNAVAILABLE' })
  expect(db.communityPost.create).not.toHaveBeenCalled()
})

test('duplicate tag selections are stored only once', async () => {
  expect((await POST(request(undefined, ['tag', 'tag']))).status).toBe(201)
  expect(db.communityPost.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tags: { create: [{ tagId: 'tag' }] } }) }))
})
