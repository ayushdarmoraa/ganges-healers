import { randomUUID } from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET, PATCH as markAll } from '@/app/api/notifications/route'
import { PATCH as markOne } from '@/app/api/notifications/[id]/read/route'
import { POST as comment } from '@/app/api/community/comments/route'
import { POST as like } from '@/app/api/community/likes/route'
import { deliverNotification, storeNotification } from '@/lib/notifications/delivery'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/requireVIP', () => ({ requireVIP: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/queues/jobs', () => ({ enqueueNotification: jest.fn().mockResolvedValue(false) }))
jest.mock('@/lib/socket', () => ({ emitNotification: jest.fn() }))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const vip = jest.requireMock<{ requireVIP: jest.Mock }>('@/lib/auth/requireVIP').requireVIP
const emit = jest.requireMock<{ emitNotification: jest.Mock }>('@/lib/socket').emitNotification
const users: string[] = []
const request = (path = '/api/notifications', body?: object) => new NextRequest(`http://localhost${path}`, body ? { method: 'PATCH', body: JSON.stringify(body) } : undefined)
const read = (id: string, body?: object) => markOne(request(`/api/notifications/${id}/read`, body), { params: Promise.resolve({ id }) })
const list = async (query = '') => (await GET(request(`/api/notifications${query}`))).json()
const create = (userId = users[0], data: { title?: string; type?: string; message?: string; read?: boolean; createdAt?: Date } = {}) => prisma.notification.create({ data: { userId, title: 'New activity', message: 'Someone replied.', type: 'community_comment', ...data } })
beforeAll(async () => {
  for (const name of ['Alice', 'Bob']) users.push((await prisma.user.create({ data: { name, email: `notifications-${randomUUID()}@example.test`, vip: true } })).id)
})
beforeEach(async () => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { id: users[0] } }); vip.mockResolvedValue({ user: { id: users[1] } })
  await prisma.notification.deleteMany({ where: { userId: { in: users } } })
  await prisma.communityPost.deleteMany({ where: { userId: { in: users } } })
})
afterAll(async () => {
  await prisma.communityPost.deleteMany({ where: { userId: { in: users } } })
  await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.$disconnect()
})

test('legacy lists and tied-time pagination expose only owned rows without omissions or duplicates', async () => {
  const time = new Date('2026-10-01T12:00:00Z')
  await prisma.notification.createMany({ data: Array.from({ length: 34 }, (_, i) => ({ userId: users[0], type: 'community_comment', title: `Activity ${i}`, message: 'Owned', createdAt: time })) })
  await create(users[1], { title: 'Private Bob activity' })
  const legacy = await list()
  expect(legacy.notifications).toHaveLength(30); expect(legacy.unreadCount).toBe(34)
  const ids: string[] = []
  let cursor: string | null = null
  do {
    const page = await list(`?limit=7${cursor ? `&cursor=${cursor}` : ''}&userId=${users[1]}`)
    expect(page.ownerId).toBe(users[0]); expect(page.notifications.every((row: { userId: string }) => row.userId === users[0])).toBe(true)
    ids.push(...page.notifications.map((row: { id: string }) => row.id)); cursor = page.nextCursor
  } while (cursor)
  expect(ids).toHaveLength(34); expect(new Set(ids).size).toBe(34)
})

test('a missing and a different account cursor both return 404', async () => {
  const foreign = await create(users[1])
  const missing = await GET(request('/api/notifications?cursor=missing'))
  const other = await GET(request(`/api/notifications?cursor=${foreign.id}`))
  expect(missing.status).toBe(404); expect(other.status).toBe(404)
  expect(await other.json()).toEqual(await missing.json())
})

test('status, type, and case-insensitive title/message search preserve the account-wide unread count', async () => {
  const comment = await create(users[0], { title: 'REIKI discussion', read: true })
  await create(users[0], { type: 'community_like', message: 'Reiki liked' })
  const other = await create(users[0], { type: 'booking_update', message: 'A booking was updated' })
  await create(users[1], { title: 'REIKI private' })
  expect(await list('?status=read&type=community_comment&q=reiki')).toMatchObject({ notifications: [{ id: comment.id }], unreadCount: 2 })
  expect((await list('?type=other')).notifications.map((row: { id: string }) => row.id)).toEqual([other.id])
  expect((await list('?status=unread&type=community_like&q=REIKI')).notifications).toHaveLength(1)
})

test('legacy read and explicit unread are idempotent, and foreign/missing IDs cannot be changed', async () => {
  const own = await create(); const foreign = await create(users[1])
  for (let i = 0; i < 2; i++) expect(await (await read(own.id)).json()).toMatchObject({ ok: true, unreadCount: 0 })
  expect(await (await read(own.id, { read: false, ownerId: users[0] })).json()).toMatchObject({ unreadCount: 1 })
  expect((await read(foreign.id)).status).toBe(404); expect((await read('missing')).status).toBe(404)
  expect(await prisma.notification.findUnique({ where: { id: foreign.id } })).toMatchObject({ read: false })
})

test('concurrent repeated read requests leave one persisted row and a correct final count', async () => {
  const own = await create(); await create()
  const results = await Promise.all(Array.from({ length: 8 }, () => read(own.id, { ownerId: users[0], read: true })))
  expect(results.every(result => result.status === 200)).toBe(true)
  expect((await list()).unreadCount).toBe(1)
  expect(await prisma.notification.count({ where: { userId: users[0] } })).toBe(2)
})

test('bulk read touches the whole owned account while preserving other owners and later arrivals', async () => {
  await create(); await create(users[0], { type: 'community_like' }); const foreign = await create(users[1])
  const result = await markAll(request('/api/notifications', { ownerId: users[0], action: 'readAll' }))
  expect(await result.json()).toMatchObject({ updated: 2, unreadCount: 0 })
  expect(await prisma.notification.findUnique({ where: { id: foreign.id } })).toMatchObject({ read: false })
  const later = await create()
  expect((await list('?status=unread')).notifications.map((row: { id: string }) => row.id)).toEqual([later.id])
})

test('anonymous requests and rendered-account mismatches make no database changes', async () => {
  const own = await create()
  expect((await read(own.id, { ownerId: users[1] })).status).toBe(409)
  expect((await markAll(request('/api/notifications', { ownerId: users[1], action: 'readAll' }))).status).toBe(409)
  auth.mockResolvedValue(null)
  expect((await GET(request())).status).toBe(401); expect((await read(own.id)).status).toBe(401)
  expect((await markAll(request('/api/notifications', { ownerId: users[0], action: 'readAll' }))).status).toBe(401)
  expect(await prisma.notification.findUnique({ where: { id: own.id } })).toMatchObject({ read: false })
})

test('confirmed Redis absence persists inline and concurrent worker retries reuse the same notification', async () => {
  const input = { notificationId: randomUUID(), userId: users[0], type: 'community_like', title: 'Your post was liked', message: 'Bob liked your post.' }
  expect(await deliverNotification(input)).toEqual({ queued: false, id: input.notificationId })
  await read(input.notificationId)
  await Promise.all(Array.from({ length: 5 }, () => storeNotification(input)))
  expect(await prisma.notification.count({ where: { userId: users[0] } })).toBe(1)
  expect(await prisma.notification.findUnique({ where: { id: input.notificationId } })).toMatchObject({ read: true })
  expect(emit).toHaveBeenCalledWith(users[0], expect.objectContaining({ id: input.notificationId }))
})

test('a reused producer ID cannot alter or emit another account’s notification', async () => {
  const row = await create(users[1])
  await expect(storeNotification({ notificationId: row.id, userId: users[0], title: row.title, type: row.type, message: row.message })).rejects.toThrow('identity conflict')
  expect(emit).not.toHaveBeenCalled()
  expect(await prisma.notification.findUnique({ where: { id: row.id } })).toMatchObject({ userId: users[1], read: false })
})

test('new comments and likes reach the author without Redis, while removing a like does not notify again', async () => {
  const post = await prisma.communityPost.create({ data: { userId: users[0], title: 'Our practice', content: 'Share your experience.' } })
  expect((await comment(request('/api/community/comments', { postId: post.id, content: 'A thoughtful reply.' }))).status).toBe(201)
  expect(await (await like(request('/api/community/likes', { postId: post.id }))).json()).toMatchObject({ liked: true })
  expect(await (await like(request('/api/community/likes', { postId: post.id }))).json()).toMatchObject({ liked: false })
  const data = await list()
  expect(data.unreadCount).toBe(2)
  expect(data.notifications.map((row: { type: string }) => row.type).sort()).toEqual(['community_comment', 'community_like'])
  expect(data.notifications.every((row: { message: string }) => row.message.includes('Bob'))).toBe(true)
  auth.mockResolvedValue({ user: { id: users[1] } })
  expect((await list()).notifications).toEqual([])
})

test('self interactions and rejected hidden-post interactions do not create notifications', async () => {
  const post = await prisma.communityPost.create({ data: { userId: users[0], title: 'Own practice', content: 'A discussion.' } })
  vip.mockResolvedValue({ user: { id: users[0] } })
  expect((await comment(request('/api/community/comments', { postId: post.id, content: 'My own reply.' }))).status).toBe(201)
  expect((await like(request('/api/community/likes', { postId: post.id }))).status).toBe(200)
  await prisma.communityPost.update({ where: { id: post.id }, data: { deletedAt: new Date() } })
  vip.mockResolvedValue({ user: { id: users[1] } })
  expect((await comment(request('/api/community/comments', { postId: post.id, content: 'Not accepted.' }))).status).toBe(404)
  expect((await like(request('/api/community/likes', { postId: post.id }))).status).toBe(404)
  expect(await prisma.notification.count({ where: { userId: { in: users } } })).toBe(0)
})
