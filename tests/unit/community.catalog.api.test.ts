import { NextRequest } from 'next/server'
import { GET, POST, PATCH } from '@/app/api/admin/community/catalog/route'
import { CommunityCatalogError, createCatalogSchema, updateCatalogSchema } from '@/lib/community/catalog'
import { communityDraftKey } from '@/lib/community/drafts'

jest.mock('@/lib/community/admin', () => ({ requireCommunityAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/community/catalog', () => ({
  ...jest.requireActual('@/lib/community/catalog'),
  listCommunityCatalog: jest.fn(), createCommunityCatalog: jest.fn(), updateCommunityCatalog: jest.fn(),
}))
const admin = jest.requireMock<{ requireCommunityAdmin: jest.Mock }>('@/lib/community/admin').requireCommunityAdmin
const catalog = jest.requireMock<{ listCommunityCatalog: jest.Mock; createCommunityCatalog: jest.Mock; updateCommunityCatalog: jest.Mock }>('@/lib/community/catalog')
const version = 'a'.repeat(64)
const request = (body: unknown, method = 'POST') => new NextRequest('http://localhost/api/admin/community/catalog', { method, body: typeof body === 'string' ? body : JSON.stringify(body) })
beforeEach(() => {
  jest.resetAllMocks()
  admin.mockResolvedValue({ id: 'admin' })
  catalog.listCommunityCatalog.mockResolvedValue({ data: [], nextCursor: null })
  catalog.createCommunityCatalog.mockResolvedValue({ data: { id: 'topic' } })
  catalog.updateCommunityCatalog.mockResolvedValue({ data: { id: 'topic' }, idempotent: false })
})

test.each(['GET', 'POST', 'PATCH'])('%s requires an admin before touching the catalog', async method => {
  admin.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  const result = method === 'GET' ? await GET(new NextRequest('http://localhost/api/admin/community/catalog')) : method === 'POST' ? await POST(request({})) : await PATCH(request({}))
  expect(result.status).toBe(403)
  expect(catalog.listCommunityCatalog).not.toHaveBeenCalled()
  expect(catalog.createCommunityCatalog).not.toHaveBeenCalled()
  expect(catalog.updateCommunityCatalog).not.toHaveBeenCalled()
})

test.each(['kind=unknown', 'limit=-1', 'limit=1.5', 'limit=101', 'status=deleted'])('invalid list filters return 400: %s', async query => {
  expect((await GET(new NextRequest(`http://localhost/api/admin/community/catalog?${query}`))).status).toBe(400)
  expect(catalog.listCommunityCatalog).not.toHaveBeenCalled()
})

test('creation normalizes a slug and takes the actor from the guard', async () => {
  const result = await POST(request({ kind: 'topic', name: '  Meditation  ', slug: '  Daily-Practice  ' }))
  expect(result.status).toBe(201)
  expect(await result.json()).toEqual({ success: true, data: { id: 'topic' } })
  expect(catalog.createCommunityCatalog).toHaveBeenCalledWith('admin', { kind: 'topic', name: 'Meditation', slug: 'daily-practice', description: '', order: 0, isActive: true })
})

test.each([
  { kind: 'tag', slug: 'valid', name: '   ' },
  { kind: 'topic', slug: '../unsafe', name: 'Topic' },
  { kind: 'tag', slug: 'two--hyphens', name: 'Tag' },
  { kind: 'topic', slug: 'valid', name: 'Topic', order: 1.5 },
  { kind: 'topic', slug: 'valid', name: 'Topic', actorId: 'spoofed' },
])('invalid creation never writes: %p', async body => {
  expect((await POST(request(body))).status).toBe(400)
  expect(catalog.createCommunityCatalog).not.toHaveBeenCalled()
})

test('URL slugs cannot be changed through the edit endpoint', async () => {
  const result = await PATCH(request({ kind: 'topic', id: 'topic', version, changes: { slug: 'replacement' } }, 'PATCH'))
  expect(result.status).toBe(400)
  expect(catalog.updateCommunityCatalog).not.toHaveBeenCalled()
})

test('all edits require a valid snapshot version and at least one editable change', () => {
  expect(updateCatalogSchema.safeParse({ kind: 'tag', id: 'tag', changes: { name: 'Updated' } }).success).toBe(false)
  expect(updateCatalogSchema.safeParse({ kind: 'topic', id: 'topic', version, changes: {} }).success).toBe(false)
  expect(updateCatalogSchema.safeParse({ kind: 'tag', id: 'tag', version, changes: { isActive: false } }).success).toBe(false)
  expect(createCatalogSchema.safeParse({ kind: 'topic', name: 'All', slug: 'all' }).success).toBe(true)
})

test('stale edits return 409 without claiming success', async () => {
  catalog.updateCommunityCatalog.mockRejectedValue(new CommunityCatalogError('Refresh the list', 409, 'CATALOG_CHANGED'))
  const result = await PATCH(request({ kind: 'topic', id: 'topic', version, changes: { isActive: false } }, 'PATCH'))
  expect(result.status).toBe(409)
  expect(await result.json()).toEqual({ error: 'Refresh the list', code: 'CATALOG_CHANGED' })
})

test('malformed JSON returns a validation response', async () => {
  expect((await POST(request('{'))).status).toBe(400)
  expect(catalog.createCommunityCatalog).not.toHaveBeenCalled()
})

test('a real all topic has a separate draft without changing existing general/topic keys', () => {
  expect(communityDraftKey('member', 'all')).not.toBe(communityDraftKey('member', ''))
  expect(communityDraftKey('member', '')).toBe('gh-community-draft:v1:member:all')
  expect(communityDraftKey('member', 'reiki')).toBe('gh-community-draft:v1:member:reiki')
})
