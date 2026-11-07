import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { profileVersion } from '@/lib/users/profile'
import { GET, PATCH } from '@/app/api/users/me/route'

let mockActor: string | null = 'owner'
jest.mock('@/lib/auth', () => ({ auth: async () => mockActor ? { user: { id: mockActor } } : null }))
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn() }, $transaction: jest.fn() } }))
const db = jest.mocked(prisma)
const current = { id: 'owner', name: 'Original name', email: 'owner@example.test', phone: null, image: null }
const version = profileVersion(current)
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://example.test/api/users/me', { method: 'PATCH', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
const guarded = { 'x-account-id': 'owner', 'if-match': `"${version}"` }
beforeEach(() => {
  jest.clearAllMocks(); mockActor = 'owner'
  db.user.findUnique.mockResolvedValue(current as never)
  db.user.findUniqueOrThrow.mockResolvedValue({ ...current, name: 'Updated' } as never)
  db.user.updateMany.mockResolvedValue({ count: 1 })
  db.$transaction.mockImplementation(async callback => (callback as (tx: unknown) => Promise<unknown>)(db))
})
afterEach(() => jest.restoreAllMocks())

test('profile status is private and has an opaque version of editable values only', async () => {
  const response = await GET()
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await response.json()).toEqual({ user: current, profileVersion: version })
  expect(db.user.findUnique).toHaveBeenCalledWith({ where: { id: 'owner', closedAt: null }, select: { id: true, name: true, email: true, phone: true, image: true, role: true, vip: true, createdAt: true } })
  const unrelated = { ...current, image: 'https://example.test/new.png', freeSessionCredits: 12 }
  expect(profileVersion(unrelated)).toBe(version)
  expect(profileVersion({ ...current, phone: '9876543210' })).not.toBe(version)
  expect(profileVersion({ ...current, id: 'another' })).not.toBe(version)
})
test('anonymous reads and edits do not look up or mutate an account', async () => {
  mockActor = null
  expect((await GET()).status).toBe(401)
  expect((await PATCH(request({ name: 'Updated' }, guarded))).status).toBe(401)
  expect(db.user.findUnique).not.toHaveBeenCalled()
  expect(db.$transaction).not.toHaveBeenCalled()
})
test('a changed signed-in account cannot save a previous account draft', async () => {
  mockActor = 'another'
  const response = await PATCH(request({ name: 'Updated' }, guarded))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'SESSION_CHANGED' })
  expect(db.$transaction).not.toHaveBeenCalled()
})
const incompleteHeaders: Array<Record<string, string>> = [{ 'x-account-id': 'owner' }, { 'if-match': `"${version}"` }, { ...guarded, 'if-match': 'invalid' }]
test.each(incompleteHeaders)('incomplete conditional request metadata is refused (%j)', async headers => {
  expect((await PATCH(request({ name: 'Updated' }, headers))).status).toBe(400)
  expect(db.$transaction).not.toHaveBeenCalled()
})
test('a newer saved profile is retained rather than overwritten', async () => {
  db.user.findUnique.mockResolvedValue({ ...current, name: 'Newer saved name' } as never)
  const response = await PATCH(request({ name: 'Updated' }, guarded))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'PROFILE_CHANGED' })
  expect(db.user.updateMany).not.toHaveBeenCalled()
})
test('an atomic conditional update also catches changes made after the read', async () => {
  db.user.updateMany.mockResolvedValue({ count: 0 })
  expect((await PATCH(request({ name: 'Updated' }, guarded))).status).toBe(409)
  expect(db.user.findUniqueOrThrow).not.toHaveBeenCalled()
})
test('saving uses only allowed changes and returns the actual saved profile/version', async () => {
  const response = await PATCH(request({ name: 'Updated', phone: null, role: 'ADMIN', freeSessionCredits: 50 }, guarded))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ user: { ...current, name: 'Updated' }, profileVersion: profileVersion({ ...current, name: 'Updated' }) })
  expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'owner', name: current.name, phone: null, closedAt: null }, data: { name: 'Updated', phone: null } })
})
test('existing JSON callers can still save without conditional headers', async () => {
  expect((await PATCH(request({ image: 'https://example.test/avatar.png' }))).status).toBe(200)
  expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'owner', name: current.name, phone: null, image: null, closedAt: null }, data: { image: 'https://example.test/avatar.png' } })
})
test('a phone uniqueness race returns the existing conflict without logging the number', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  db.user.updateMany.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('Private phone 9876543210', { code: 'P2002', clientVersion: 'test', meta: { target: ['phone'] } }))
  const response = await PATCH(request({ phone: '9876543210' }, guarded))
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'Phone number already in use' })
  expect(log).not.toHaveBeenCalled()
})
test('cross-site and non-JSON writes are refused before mutation', async () => {
  expect((await PATCH(request({ name: 'Updated' }, { ...guarded, origin: 'https://other.test' }))).status).toBe(403)
  expect((await PATCH(request({ name: 'Updated' }, { ...guarded, 'sec-fetch-site': 'cross-site' }))).status).toBe(403)
  expect((await PATCH(request({ name: 'Updated' }, { 'content-type': 'text/plain' }))).status).toBe(415)
  expect(db.$transaction).not.toHaveBeenCalled()
})
test('malformed JSON and empty or invalid changes return safe validation failures', async () => {
  expect((await PATCH(new Request('https://example.test/api/users/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{' }))).status).toBe(400)
  expect((await PATCH(request({}))).status).toBe(400)
  expect((await PATCH(request({ phone: '123' }))).status).toBe(400)
  expect(db.$transaction).not.toHaveBeenCalled()
})
test('missing accounts and unexpected errors preserve safe response contracts', async () => {
  db.user.findUnique.mockResolvedValue(null)
  expect((await GET()).status).toBe(404)
  expect((await PATCH(request({ name: 'Updated' }, guarded))).status).toBe(404)
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  db.user.findUnique.mockRejectedValue(new Error('Private database details'))
  const response = await PATCH(request({ name: 'Updated' }, guarded))
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Update failed' })
  expect(log).toHaveBeenCalledWith('[users][me][patch][error]')
})
