import { NextRequest } from 'next/server'
import { GET, POST, PATCH } from '@/app/api/admin/blog/route'
import { BlogAdminError, createBlogSchema, updateBlogSchema } from '@/lib/blog/admin'
import { isAllowedArticleImage } from '@/config/images'

jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {} }))
jest.mock('@/lib/blog/admin', () => ({
  ...jest.requireActual('@/lib/blog/admin'), listBlogArticles: jest.fn(), createBlogDraft: jest.fn(), updateBlogArticle: jest.fn(),
}))
const guard = jest.requireMock<{ requireCurrentAdmin: jest.Mock }>('@/lib/admin/auth').requireCurrentAdmin
const service = jest.requireMock<{ listBlogArticles: jest.Mock; createBlogDraft: jest.Mock; updateBlogArticle: jest.Mock }>('@/lib/blog/admin')
const version = 'a'.repeat(64)
const request = (body: unknown, method = 'POST') => new NextRequest('http://localhost/api/admin/blog', { method, body: typeof body === 'string' ? body : JSON.stringify(body) })
beforeEach(() => {
  jest.resetAllMocks()
  guard.mockResolvedValue({ id: 'admin', role: 'ADMIN' })
  service.listBlogArticles.mockResolvedValue({ data: [], counts: { draft: 0, published: 0 }, nextCursor: null })
  service.createBlogDraft.mockResolvedValue({ data: { id: 'article', published: false } })
  service.updateBlogArticle.mockResolvedValue({ data: { id: 'article' }, idempotent: false })
})

test.each(['GET', 'POST', 'PATCH'])('%s checks current admin access before article data', async method => {
  guard.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  const result = method === 'GET' ? await GET(new NextRequest('http://localhost/api/admin/blog?id=private')) : method === 'POST' ? await POST(request({})) : await PATCH(request({}))
  expect(result.status).toBe(403)
  expect(service.listBlogArticles).not.toHaveBeenCalled()
  expect(service.createBlogDraft).not.toHaveBeenCalled()
  expect(service.updateBlogArticle).not.toHaveBeenCalled()
})

test('new article inputs normalize title/slug and cannot select the actor or publication state', async () => {
  const result = await POST(request({ title: '  A new article  ', slug: '  Daily-Practice  ' }))
  expect(result.status).toBe(201)
  expect(await result.json()).toMatchObject({ success: true, data: { published: false } })
  expect(result.headers.get('cache-control')).toBe('private, no-store')
  expect(service.createBlogDraft).toHaveBeenCalledWith('admin', { title: 'A new article', slug: 'daily-practice', content: '', excerpt: '', imageUrl: '' })
  for (const body of [{ title: 'Title', slug: 'slug', published: true }, { title: 'Title', slug: 'slug', actorId: 'spoofed' }]) expect((await POST(request(body))).status).toBe(400)
})

test.each([
  ['blank title', { title: '   ', slug: 'valid' }],
  ['unsafe slug', { title: 'Title', slug: '../unsafe' }],
  ['invalid hyphens', { title: 'Title', slug: 'two--hyphens' }],
  ['content limit', { title: 'Title', slug: 'valid', content: 'a'.repeat(50001) }],
  ['summary limit', { title: 'Title', slug: 'valid', excerpt: 'a'.repeat(501) }],
  ['unsafe image', { title: 'Title', slug: 'valid', imageUrl: 'javascript:alert(1)' }],
])('invalid article input is rejected: %s', async (_label, body) => {
  expect((await POST(request(body))).status).toBe(400)
  expect(service.createBlogDraft).not.toHaveBeenCalled()
})

test('slugs are immutable and every edit needs a saved version and nonempty changes', async () => {
  for (const body of [
    { id: 'article', changes: { title: 'Updated' } },
    { id: 'article', version, changes: {} },
    { id: 'article', version, changes: { slug: 'replacement' } },
  ]) expect((await PATCH(request(body, 'PATCH'))).status).toBe(400)
  expect(service.updateBlogArticle).not.toHaveBeenCalled()
})

test('partial edits do not implicitly clear content or change publication', () => {
  expect(updateBlogSchema.parse({ id: 'article', version, changes: { title: 'Renamed' } }).changes).toEqual({ title: 'Renamed' })
  expect(createBlogSchema.parse({ title: 'Title', slug: 'title' }).content).toBe('')
})

test('publication conflicts retain a safe domain response', async () => {
  service.updateBlogArticle.mockRejectedValue(new BlogAdminError('Another admin changed this article', 409, 'ARTICLE_CHANGED'))
  const result = await PATCH(request({ id: 'article', version, changes: { published: true } }, 'PATCH'))
  expect(result.status).toBe(409)
  expect(await result.json()).toEqual({ error: 'Another admin changed this article', code: 'ARTICLE_CHANGED' })
})

test.each(['status=deleted', 'limit=0', 'limit=101', 'limit=2.5'])('invalid admin list filters return 400: %s', async query => {
  expect((await GET(new NextRequest(`http://localhost/api/admin/blog?${query}`))).status).toBe(400)
  expect(service.listBlogArticles).not.toHaveBeenCalled()
})

test('malformed JSON returns 400 without reaching the service', async () => {
  expect((await POST(request('{'))).status).toBe(400)
  expect(service.createBlogDraft).not.toHaveBeenCalled()
})

test.each([
  ['', true], ['https://cover.public.blob.vercel-storage.com/cover.jpg', true],
  ['https://avatars.githubusercontent.com/u/123', true], ['https://lh3.googleusercontent.com/cover', true],
  ['http://avatars.githubusercontent.com/u/123', false], ['https://avatars.githubusercontent.com.evil.test/cover', false],
  ['https://user:password@avatars.githubusercontent.com/cover', false], ['https://avatars.githubusercontent.com:444/cover', false],
  ['data:image/png;base64,example', false], ['//avatars.githubusercontent.com/cover', false],
])('image URLs follow the configured host rules: %s', (url, allowed) => expect(isAllowedArticleImage(String(url))).toBe(allowed))
