import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET as adminGet, POST as adminCreate, PATCH as adminUpdate } from '@/app/api/admin/blog/route'
import { GET as listPublic } from '@/app/api/blog/route'
import { GET as readPublic } from '@/app/api/blog/[slug]/route'
import { GET as search } from '@/app/api/search/route'
import { createBlogDraft, updateBlogArticle, type BlogArticle } from '@/lib/blog/admin'
import { getSitemapItems } from '@/lib/seo/sitemap'
import { cacheDeleteByPrefix, cacheSet } from '@/lib/cache'

jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
const guard = jest.requireMock<{ requireCurrentAdmin: jest.Mock }>('@/lib/admin/auth').requireCurrentAdmin
const users: string[] = []
const articles: string[] = []
let draft: BlogArticle
let term: string
const request = (path: string, body?: object) => new NextRequest(`http://localhost${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)
const edit = (article: BlogArticle, changes: object) => adminUpdate(request('/api/admin/blog', { id: article.id, version: article.version, changes }))
const detail = (slug = draft.slug) => readPublic(request(`/api/blog/${slug}`), { params: Promise.resolve({ slug }) })
const searchPublic = () => search(request(`/api/search?q=${term}`))
const fresh = async () => (await (await adminGet(request(`/api/admin/blog?id=${draft.id}`))).json()).data as BlogArticle

beforeAll(async () => {
  for (let i = 0; i < 2; i++) users.push((await prisma.user.create({ data: { email: `blog-admin-${crypto.randomUUID()}@example.test`, role: 'ADMIN' } })).id)
})
beforeEach(async () => {
  guard.mockResolvedValue({ id: users[0], role: 'ADMIN' })
  term = `blogquartz${crypto.randomBytes(6).toString('hex')}`
  draft = (await createBlogDraft(users[0], { slug: term, title: `A ${term} practice`, content: `A plain text article about ${term}.`, excerpt: `Summary ${term}`, imageUrl: '' })).data
  articles.push(draft.id)
})
afterEach(() => { cacheDeleteByPrefix('blog:'); cacheDeleteByPrefix('search:') })
afterAll(async () => {
  if (users.length) await prisma.activityLog.deleteMany({ where: { userId: { in: users } } })
  await prisma.blogPost.deleteMany({ where: { id: { in: articles } } })
  if (users.length) await prisma.user.deleteMany({ where: { id: { in: users } } })
  await prisma.$disconnect()
})

test('creation starts private despite the legacy published model default', async () => {
  expect(await prisma.blogPost.findUnique({ where: { id: draft.id } })).toMatchObject({ published: false })
  expect((await detail()).status).toBe(404)
  expect((await detail(draft.id)).status).toBe(404)
  expect((await (await listPublic()).json()).some((row: { id: string }) => row.id === draft.id)).toBe(false)
  expect((await (await searchPublic()).json()).blog).toEqual([])
  expect((await getSitemapItems()).some(row => row.url.endsWith(`/blog/${draft.slug}`))).toBe(false)
})

test('publish, live edit, withdraw, and republish retain the same ID and URL', async () => {
  let result = await edit(draft, { published: true })
  expect(result.status).toBe(200)
  let saved: BlogArticle = (await result.json()).data
  expect((await (await detail()).json())).toMatchObject({ id: draft.id, slug: draft.slug, published: true })
  result = await edit(saved, { title: 'A revised title' })
  saved = (await result.json()).data
  expect((await (await detail()).json()).title).toBe('A revised title')
  result = await edit(saved, { published: false })
  saved = (await result.json()).data
  expect((await detail()).status).toBe(404)
  expect(saved.content).toBe(draft.content)
  expect((await edit(saved, { published: true })).status).toBe(200)
  expect((await (await detail()).json())).toMatchObject({ id: draft.id, slug: draft.slug, title: 'A revised title', content: draft.content })
})

test('partial edits preserve omitted content, summary, cover, and publication fields', async () => {
  const result = await edit(draft, { title: 'Renamed draft' })
  expect(result.status).toBe(200)
  expect((await result.json()).data).toMatchObject({ content: draft.content, excerpt: draft.excerpt, imageUrl: null, published: false })
})

test('a draft cannot publish without body text and no publication audit is written', async () => {
  const empty = (await (await edit(draft, { content: '   ' })).json()).data
  const result = await edit(empty, { published: true })
  expect(result.status).toBe(400)
  expect(await result.json()).toMatchObject({ code: 'CONTENT_REQUIRED' })
  expect((await detail()).status).toBe(404)
  expect(await prisma.activityLog.count({ where: { entityId: draft.id, action: 'blog_article_published' } })).toBe(0)
})

test('only one of two simultaneous admin decisions wins the saved version', async () => {
  const results = await Promise.allSettled([
    updateBlogArticle(users[0], { id: draft.id, version: draft.version, changes: { published: true } }),
    updateBlogArticle(users[1], { id: draft.id, version: draft.version, changes: { title: 'Other proposed edit' } }),
  ])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'ARTICLE_CHANGED' } })
  const audits = await prisma.activityLog.findMany({ where: { entityId: draft.id, action: { in: ['blog_article_published', 'blog_article_updated'] } } })
  expect(audits).toHaveLength(1)
  expect(users).toContain(audits[0].userId)
})

test('a stale publish cannot publish newer content the admin has not reviewed', async () => {
  await edit(draft, { content: 'Replaced after another admin opened the editor.' })
  const result = await edit(draft, { published: true })
  expect(result.status).toBe(409)
  expect((await detail()).status).toBe(404)
  expect((await fresh()).content).toBe('Replaced after another admin opened the editor.')
})

test('concurrent duplicate creation yields one draft and one 409', async () => {
  const slug = `duplicate-${term}`
  const body = { title: 'Concurrent draft', slug }
  const results = await Promise.all([adminCreate(request('/api/admin/blog', body)), adminCreate(request('/api/admin/blog', { ...body, slug: slug.toUpperCase() }))])
  expect(results.map(result => result.status).sort()).toEqual([201, 409])
  const saved = await prisma.blogPost.findUniqueOrThrow({ where: { slug } })
  articles.push(saved.id)
  expect(saved.published).toBe(false)
  expect(await prisma.activityLog.count({ where: { entityId: saved.id, action: 'blog_draft_created' } })).toBe(1)
})

test('article creation rolls back if its audit write cannot commit', async () => {
  const slug = `rollback-${term}`
  await expect(createBlogDraft(`missing-${term}`, { title: 'Must roll back', slug, content: '', excerpt: '', imageUrl: '' })).rejects.toMatchObject({ code: 'P2003' })
  expect(await prisma.blogPost.count({ where: { slug } })).toBe(0)
})

test('a failed audit rolls back publication itself', async () => {
  await expect(updateBlogArticle(`missing-${term}`, { id: draft.id, version: draft.version, changes: { published: true } })).rejects.toMatchObject({ code: 'P2003' })
  expect(await prisma.blogPost.findUnique({ where: { id: draft.id } })).toMatchObject({ published: false })
  expect((await fresh()).version).toBe(draft.version)
  expect((await detail()).status).toBe(404)
})

test('a no-op save keeps its version without adding an audit entry', async () => {
  const result = await edit(draft, { title: draft.title })
  const body = await result.json()
  expect(body).toMatchObject({ idempotent: true, data: { version: draft.version } })
  expect(await prisma.activityLog.count({ where: { entityId: draft.id, action: 'blog_article_updated' } })).toBe(0)
})

test('public list and search ignore stale cached blog data after withdrawal', async () => {
  const live: BlogArticle = (await (await edit(draft, { published: true })).json()).data
  expect((await (await searchPublic()).json()).blog).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id })]))
  cacheSet('blog:list', [live])
  cacheSet(`search:${term}:*`, { services: [], healers: [], programs: [], courses: [], products: [], audio: [], blog: [live] })
  expect((await edit(live, { published: false })).status).toBe(200)
  const list = await listPublic()
  expect(list.headers.get('cache-control')).toBe('no-store')
  expect((await list.json()).some((row: { id: string }) => row.id === draft.id)).toBe(false)
  const result = await searchPublic()
  expect(result.headers.get('cache-control')).toBe('no-store')
  expect((await result.json()).blog).toEqual([])
  expect((await getSitemapItems()).some(row => row.url.endsWith(`/blog/${draft.slug}`))).toBe(false)
})

test('publishing appears immediately even when an earlier empty search was cached', async () => {
  expect((await (await searchPublic()).json()).blog).toEqual([])
  await edit(draft, { published: true })
  expect((await (await searchPublic()).json()).blog).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id })]))
  expect((await (await listPublic()).json())).toEqual(expect.arrayContaining([expect.objectContaining({ id: draft.id })]))
})

test('manager search and pagination include private drafts without returning their full bodies', async () => {
  const second = (await createBlogDraft(users[0], { title: `Other ${term}`, slug: `other-${term}`, content: 'Private body', excerpt: '', imageUrl: '' })).data
  articles.push(second.id)
  const prefix = `/api/admin/blog?status=draft&q=${term}&limit=1`
  const first = await (await adminGet(request(prefix))).json()
  expect(first.data).toHaveLength(1)
  expect(first.data[0]).not.toHaveProperty('content')
  expect(first.data[0]).not.toHaveProperty('version')
  expect(first.nextCursor).toBeTruthy()
  const next = await (await adminGet(request(`${prefix}&cursor=${first.nextCursor}`))).json()
  expect(next.data).toHaveLength(1)
  expect(next.data[0].id).not.toBe(first.data[0].id)
  expect(next.nextCursor).toBeNull()
})
