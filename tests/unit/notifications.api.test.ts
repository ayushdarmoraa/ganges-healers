import { GET, PATCH as markAll } from '@/app/api/notifications/route'
import { PATCH as markOne } from '@/app/api/notifications/[id]/read/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { notification: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), updateMany: jest.fn() } } }))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const db = jest.requireMock<{ prisma: { notification: Record<string, jest.Mock> } }>('@/lib/prisma').prisma.notification
const request = (query = '', body?: unknown) => new Request(`http://localhost/api/notifications${query}`, body === undefined ? undefined : { method: 'PATCH', body: typeof body === 'string' ? body : JSON.stringify(body) })
const one = (body?: unknown, id = 'owned') => markOne(request('', body), { params: Promise.resolve({ id }) })
beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 'alice' } })
  db.findMany.mockResolvedValue([]); db.findFirst.mockResolvedValue({ id: 'owned' }); db.count.mockResolvedValue(3); db.updateMany.mockResolvedValue({ count: 1 })
})

test('every operation requires a session before querying or writing', async () => {
  auth.mockResolvedValue(null)
  for (const result of [await GET(request()), await one(), await markAll(request('', { action: 'readAll', ownerId: 'alice' }))]) expect(result.status).toBe(401)
  expect(db.findMany).not.toHaveBeenCalled(); expect(db.updateMany).not.toHaveBeenCalled()
})

test('the original list keys remain and a caller cannot select another owner', async () => {
  const result = await GET(request('?userId=bob'))
  expect(result.status).toBe(200)
  expect(result.headers.get('cache-control')).toBe('private, no-store')
  expect(await result.json()).toEqual({ ownerId: 'alice', notifications: [], unreadCount: 3, nextCursor: null })
  expect(db.findMany.mock.calls[0][0].where).toEqual({ userId: 'alice' })
  expect(db.count).toHaveBeenCalledWith({ where: { userId: 'alice', read: false } })
})

test('filters, search, and stable pagination retain account scope and global unread count', async () => {
  db.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
  const result = await GET(request('?status=read&type=other&q=REIKI&limit=2&cursor=owned'))
  expect(await result.json()).toMatchObject({ notifications: [{ id: 'a' }, { id: 'b' }], nextCursor: 'b', unreadCount: 3 })
  expect(db.findFirst).toHaveBeenCalledWith({ where: { id: 'owned', userId: 'alice' }, select: { id: true } })
  expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'alice', read: true, type: { notIn: ['community_comment', 'community_like'] }, OR: [{ title: { contains: 'REIKI', mode: 'insensitive' } }, { message: { contains: 'REIKI', mode: 'insensitive' } }] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], cursor: { id: 'owned' }, skip: 1, take: 3 }))
})

test('unknown and foreign account cursors return the same 404 without listing', async () => {
  db.findFirst.mockResolvedValue(null)
  expect((await GET(request('?cursor=foreign'))).status).toBe(404)
  expect(db.findMany).not.toHaveBeenCalled()
})

test.each(['?status=bad', '?type=bad', '?limit=0', '?limit=101', '?limit=1.5', `?q=${'x'.repeat(201)}`, '?cursor='])('invalid filters never query: %s', async query => {
  expect((await GET(request(query))).status).toBe(400)
  expect(db.findMany).not.toHaveBeenCalled()
})

test('the empty legacy PATCH still marks read using a single ownership-scoped write', async () => {
  expect(await (await one()).json()).toEqual({ ok: true, ownerId: 'alice', unreadCount: 3 })
  expect(db.updateMany).toHaveBeenCalledWith({ where: { id: 'owned', userId: 'alice' }, data: { read: true } })
  expect(db.findFirst).not.toHaveBeenCalled()
})

test('mark unread is explicit and idempotent while a missing/foreign ID returns 404', async () => {
  expect((await one({ ownerId: 'alice', read: false })).status).toBe(200)
  expect(db.updateMany).toHaveBeenCalledWith({ where: { id: 'owned', userId: 'alice' }, data: { read: false } })
  db.updateMany.mockResolvedValue({ count: 0 })
  expect((await one({}, 'foreign')).status).toBe(404)
})

test.each(['{', { read: 'yes' }, { read: true, userId: 'bob' }, { ownerId: '' }])('malformed read body cannot write: %p', async body => {
  expect((await one(body)).status).toBe(400)
  expect(db.updateMany).not.toHaveBeenCalled()
})

test('stale account mutations cannot affect the session that replaced the rendered account', async () => {
  for (const result of [await one({ ownerId: 'bob', read: true }), await markAll(request('', { ownerId: 'bob', action: 'readAll' }))]) {
    expect(result.status).toBe(409); expect(await result.json()).toMatchObject({ code: 'SESSION_CHANGED' })
  }
  expect(db.updateMany).not.toHaveBeenCalled()
})

test('bulk marks only current owned unread records and reports the server count', async () => {
  expect(await (await markAll(request('', { ownerId: 'alice', action: 'readAll' }))).json()).toEqual({ ok: true, ownerId: 'alice', updated: 1, unreadCount: 3 })
  expect(db.updateMany).toHaveBeenCalledWith({ where: { userId: 'alice', read: false }, data: { read: true } })
})

test.each([{}, { action: 'readAll' }, { action: 'delete', ownerId: 'alice' }, { action: 'readAll', ownerId: 'alice', userId: 'bob' }, '{'])('invalid bulk request cannot write: %p', async body => {
  expect((await markAll(request('', body))).status).toBe(400)
  expect(db.updateMany).not.toHaveBeenCalled()
})
