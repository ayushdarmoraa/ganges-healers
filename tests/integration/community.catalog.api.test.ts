import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createCommunityCatalog, listCommunityCatalog, requireActivePublishingTopic, updateCommunityCatalog, type CatalogItem } from '@/lib/community/catalog'
import { GET, POST, PATCH } from '@/app/api/admin/community/catalog/route'
import { GET as getTopics } from '@/app/api/community/topics/route'
import { GET as getTags } from '@/app/api/community/tags/route'
import { POST as publish } from '@/app/api/community/posts/route'
import { GET as getPost } from '@/app/api/community/posts/[id]/route'
import { getCommunityTopic } from '@/lib/community/topics'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/auth/requireVIP', () => ({ requireVIP: jest.fn() }))
jest.mock('@/lib/community/admin', () => ({ requireCommunityAdmin: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const vip = jest.requireMock<{ requireVIP: jest.Mock }>('@/lib/auth/requireVIP').requireVIP
const admin = jest.requireMock<{ requireCommunityAdmin: jest.Mock }>('@/lib/community/admin').requireCommunityAdmin
const users: string[] = []
const topicIds: string[] = []
const tagIds: string[] = []
let topic: CatalogItem
let tag: CatalogItem
const request = (path: string, body?: object) => new NextRequest(`http://localhost${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)
const edit = (item: CatalogItem, changes: object) => PATCH(request('/api/admin/community/catalog', { kind: item.kind, id: item.id, version: item.version, changes }))
const createPost = (data: { deletedAt?: Date } = {}) => prisma.communityPost.create({ data: { userId: users[2], topicId: topic.id, title: 'Catalog discussion', content: 'Discussion body', tags: { create: { tagId: tag.id } }, ...data } })
const publishToTopic = () => publish(request('/api/community/posts', { title: 'New discussion', content: 'A new practice', topicId: topic.id, tagIds: [tag.id] }))

beforeAll(async () => {
  for (let i = 0; i < 3; i++) users.push((await prisma.user.create({ data: { email: `catalog-${crypto.randomUUID()}@example.test`, role: i < 2 ? 'ADMIN' : 'USER' } })).id)
})
beforeEach(async () => {
  admin.mockResolvedValue({ id: users[0], role: 'ADMIN' })
  auth.mockResolvedValue({ user: { id: users[2] } })
  vip.mockResolvedValue({ user: { id: users[2] } })
  topic = (await createCommunityCatalog(users[0], { kind: 'topic', name: 'Catalog topic', slug: `catalog-${crypto.randomUUID()}`, description: 'Description', order: 0, isActive: true })).data
  tag = (await createCommunityCatalog(users[0], { kind: 'tag', name: 'Catalog tag', slug: `catalog-${crypto.randomUUID()}` })).data
  topicIds.push(topic.id); tagIds.push(tag.id)
})
afterAll(async () => {
  if (users.length) {
    await prisma.activityLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.communityPost.deleteMany({ where: { userId: { in: users } } })
    await prisma.communityTopic.deleteMany({ where: { id: { in: topicIds } } })
    await prisma.communityTag.deleteMany({ where: { id: { in: tagIds } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
  }
  await prisma.$disconnect()
})

test('created topics and tags appear in member choices without exposing admin metadata', async () => {
  expect((await (await getTopics()).json()).data).toContainEqual({ id: topic.id, slug: topic.slug, name: topic.name, description: topic.description })
  expect((await (await getTags()).json()).data).toContainEqual({ id: tag.id, slug: tag.slug, name: tag.name })
})

test('topic edits preserve its URL and existing discussion associations', async () => {
  const post = await createPost()
  const response = await edit(topic, { name: 'Renamed topic', description: 'Updated description', order: -10 })
  expect(response.status).toBe(200)
  const updated = (await response.json()).data
  expect(updated).toMatchObject({ id: topic.id, slug: topic.slug, name: 'Renamed topic', order: -10 })
  expect(updated.version).not.toBe(topic.version)
  expect(await getCommunityTopic(topic.slug)).toMatchObject({ id: topic.id, name: 'Renamed topic' })
  expect(await prisma.communityPost.findUnique({ where: { id: post.id } })).toMatchObject({ topicId: topic.id, deletedAt: null })
  expect(await prisma.activityLog.findFirst({ where: { entityId: topic.id, action: 'community_topic_updated' } })).toMatchObject({ userId: users[0], metadata: { changedFields: ['name', 'description', 'order'] } })
})

test('renaming a tag keeps its permalink and post-tag links', async () => {
  const post = await createPost()
  expect((await edit(tag, { name: 'Renamed tag' })).status).toBe(200)
  const body = await (await getPost(request(`/api/community/posts/${post.id}`), { params: Promise.resolve({ id: post.id }) })).json()
  expect(body.data.tags).toContainEqual(expect.objectContaining({ tag: expect.objectContaining({ id: tag.id, slug: tag.slug, name: 'Renamed tag' }) }))
})

test('deactivation removes choices and blocks publication while preserving discussions; activation restores choices', async () => {
  const post = await createPost()
  const inactive = (await (await edit(topic, { isActive: false })).json()).data
  expect((await (await getTopics()).json()).data.some((row: { id: string }) => row.id === topic.id)).toBe(false)
  expect(await getCommunityTopic(topic.slug)).toBeNull()
  const rejected = await publishToTopic()
  expect(rejected.status).toBe(400)
  expect(await rejected.json()).toMatchObject({ code: 'TOPIC_UNAVAILABLE' })
  expect((await getPost(request(`/api/community/posts/${post.id}`), { params: Promise.resolve({ id: post.id }) })).status).toBe(200)
  expect((await edit(inactive, { isActive: true })).status).toBe(200)
  expect((await publishToTopic()).status).toBe(201)
})

test('simultaneous creation of the same normalized slug yields one creation and one conflict', async () => {
  const slug = `duplicate-${crypto.randomUUID()}`
  const body = { kind: 'topic', slug, name: 'Concurrent topic' }
  const responses = await Promise.all([POST(request('/api/admin/community/catalog', body)), POST(request('/api/admin/community/catalog', { ...body, slug: slug.toUpperCase() }))])
  expect(responses.map(response => response.status).sort()).toEqual([201, 409])
  const created = await prisma.communityTopic.findUniqueOrThrow({ where: { slug } })
  topicIds.push(created.id)
  expect(await prisma.communityTopic.count({ where: { slug } })).toBe(1)
  expect(await prisma.activityLog.count({ where: { entityId: created.id, action: 'community_topic_created' } })).toBe(1)
})

test('concurrent admin edits cannot overwrite each other and audit only the winning decision', async () => {
  const names = ['First proposed name', 'Second proposed name']
  const outcomes = await Promise.allSettled(users.slice(0, 2).map((actor, index) => updateCommunityCatalog(actor, { kind: 'topic', id: topic.id, version: topic.version, changes: { name: names[index] } })))
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'CATALOG_CHANGED' } })
  const saved = await prisma.communityTopic.findUniqueOrThrow({ where: { id: topic.id } })
  expect(names).toContain(saved.name)
  const audits = await prisma.activityLog.findMany({ where: { entityId: topic.id, action: 'community_topic_updated' } })
  expect(audits).toHaveLength(1)
  expect(audits[0].userId).toBe(users[names.indexOf(saved.name)])
})

test('a stale deactivation cannot silently discard a newer admin edit', async () => {
  await edit(topic, { name: 'Current name' })
  const result = await edit(topic, { isActive: false })
  expect(result.status).toBe(409)
  expect(await prisma.communityTopic.findUnique({ where: { id: topic.id } })).toMatchObject({ name: 'Current name', isActive: true })
})

test('usage includes hidden discussions and does not invalidate the editable snapshot', async () => {
  await createPost()
  await createPost({ deletedAt: new Date() })
  for (const item of [topic, tag]) {
    const listed = await (await GET(request(`/api/admin/community/catalog?kind=${item.kind}&q=${item.slug}`))).json()
    expect(listed.data).toEqual([expect.objectContaining({ id: item.id, postCount: 2, version: item.version })])
  }
  expect((await edit(topic, { name: 'Still editable' })).status).toBe(200)
})

test('a no-op edit succeeds without adding misleading audit history', async () => {
  const result = await edit(topic, { name: topic.name })
  expect((await result.json()).idempotent).toBe(true)
  expect(await prisma.activityLog.count({ where: { entityId: topic.id, action: 'community_topic_updated' } })).toBe(0)
})

test('an audit foreign-key failure rolls back catalog creation', async () => {
  const slug = `rolled-back-${crypto.randomUUID()}`
  await expect(createCommunityCatalog(`missing-${crypto.randomUUID()}`, { kind: 'tag', slug, name: 'Must roll back' })).rejects.toMatchObject({ code: 'P2003' })
  expect(await prisma.communityTag.count({ where: { slug } })).toBe(0)
})

test('a publishing transaction holds a shared topic row lock until the post commits', async () => {
  let signalLocked!: () => void
  let release!: () => void
  const locked = new Promise<void>(resolve => { signalLocked = resolve })
  const released = new Promise<void>(resolve => { release = resolve })
  const publishing = prisma.$transaction(async tx => {
    await requireActivePublishingTopic(tx, topic.id)
    signalLocked()
    await released
    return tx.communityPost.create({ data: { userId: users[2], topicId: topic.id, title: 'Lock-protected discussion', content: 'This commit precedes deactivation.' } })
  }, { timeout: 10000 })
  try {
    await locked
    // NOWAIT gives a deterministic conflict instead of guessing whether a slow request is waiting.
    await expect(prisma.$transaction(async tx => tx.$queryRaw`SELECT "id" FROM "CommunityTopic" WHERE "id" = ${topic.id} FOR UPDATE NOWAIT`)).rejects.toMatchObject({ code: 'P2010', meta: expect.objectContaining({ code: '55P03' }) })
  } finally { release(); await publishing }
  expect((await edit(topic, { isActive: false })).status).toBe(200)
})

test('search, active filtering, and pagination respect topic display order', async () => {
  const token = crypto.randomUUID()
  for (const order of [-20, -10]) {
    const row = (await createCommunityCatalog(users[0], { kind: 'topic', slug: `ordered-${crypto.randomUUID()}`, name: `Ordered ${token} ${order}`, description: '', order, isActive: true })).data
    topicIds.push(row.id)
  }
  const query = { kind: 'topic' as const, status: 'active' as const, q: token, limit: 1 }
  const first = await listCommunityCatalog(query)
  expect(first.data.map(item => item.order)).toEqual([-20])
  expect(first.nextCursor).toBeTruthy()
  const second = await listCommunityCatalog({ ...query, cursor: first.nextCursor! })
  expect(second.data.map(item => item.order)).toEqual([-10])
  expect(second.nextCursor).toBeNull()
})
