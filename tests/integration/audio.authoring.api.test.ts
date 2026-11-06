import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { POST, PATCH, GET } from '@/app/api/admin/audio/route'
import { GET as publicList } from '@/app/api/audio/route'
import { GET as publicDetail } from '@/app/api/audio/[slug]/route'
import { GET as search } from '@/app/api/search/route'
import { createManagedAudio, changeManagedAudio, audioAdminDetail } from '@/lib/audio/admin'
import { cacheSet } from '@/lib/cache'
import { getSitemapItems } from '@/lib/seo/sitemap'
import { lockTransaction } from '@/lib/db/locks'
import fs from 'node:fs/promises'

let mockActor: { user: { id: string; role: string } } | null = null
jest.mock('@/lib/auth', () => ({ auth: jest.fn(async () => mockActor) }))
const users: string[] = [], tracks: string[] = []
const previousMode = process.env.TEST_MODE
const fields = { title: 'Quiet sunrise', slug: '', description: 'Audio authoring integration fixture', category: 'Meditation', audioUrl: 'https://media.example.test/quiet.mp3', duration: 300, isPremium: false }
const detailsFields = { title: fields.title, description: fields.description, category: fields.category, audioUrl: fields.audioUrl, duration: fields.duration, isPremium: fields.isPremium }
const create = async (overrides = {}) => { const result = await createManagedAudio(users[0], { ...fields, slug: `audio-${randomUUID()}`, ...overrides }); tracks.push(result.data.id); return result.data }
const request = (method: string, body: unknown) => new NextRequest('http://localhost/api/admin/audio', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const playback = (slug: string) => publicDetail(new Request(`http://localhost/api/audio/${slug}`), { params: Promise.resolve({ slug }) })
beforeAll(async () => { process.env.TEST_MODE = '0'; for (const role of ['ADMIN', 'USER', 'HEALER'] as const) users.push((await prisma.user.create({ data: { email: `audio-${randomUUID()}@example.test`, role } })).id) })
beforeEach(() => { mockActor = { user: { id: users[0], role: 'ADMIN' } } })
afterAll(async () => { try { await prisma.activityLog.deleteMany({ where: { userId: { in: users } } }); await prisma.audioTrack.deleteMany({ where: { id: { in: tracks } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }) } finally { if (previousMode === undefined) delete process.env.TEST_MODE; else process.env.TEST_MODE = previousMode; await prisma.$disconnect() } })

test('real role authorization runs before parsing bodies and protects private reads', async () => {
  for (const id of [users[1], users[2], randomUUID()]) { mockActor = { user: { id, role: 'ADMIN' } }; expect((await POST(request('POST', {}))).status).toBe(403); expect((await GET(new NextRequest('http://localhost/api/admin/audio'))).status).toBe(403) }
  mockActor = null; expect((await GET(new NextRequest('http://localhost/api/admin/audio'))).status).toBe(403)
})
test('create produces an audited private draft and public metadata never exposes it', async () => {
  const slug = `privatedraft${randomUUID().replaceAll('-', '')}`
  const response = await POST(request('POST', { ...fields, slug, title: slug }))
  expect(response.status).toBe(201); expect(response.headers.get('cache-control')).toBe('private, no-store')
  const row = (await response.json()).data; tracks.push(row.id); expect(row.isPublished).toBe(false)
  expect((await playback(slug)).status).toBe(404); expect((await playback(row.id)).status).toBe(404)
  expect(await (await publicList(new Request('http://localhost/api/audio'))).text()).not.toContain(slug)
  expect(await (await search(new Request(`http://localhost/api/search?q=${slug}`))).text()).not.toContain(row.id)
  expect((await getSitemapItems()).some(item => item.url.endsWith(`/audio/${slug}`))).toBe(false)
  expect(await prisma.activityLog.count({ where: { entityId: row.id, action: 'audio_draft_created' } })).toBe(1)
})
test('publication, free-to-premium changes and withdrawal take effect despite warm list/search caches', async () => {
  const slug = `publication${randomUUID().replaceAll('-', '')}`
  let row = await create({ slug, title: slug })
  const query = new Request(`http://localhost/api/search?q=${slug}`)
  await search(query)
  row = (await changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'publish' } })).data
  expect((await (await playback(slug)).json()).audioUrl).toBe(fields.audioUrl)
  expect((await (await search(query)).json()).audio.map((item: { id: string }) => item.id)).toContain(row.id)
  cacheSet('audio:list:all', { tracks: [row], categories: [row.category] })
  row = (await changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'details', fields: { ...detailsFields, title: slug, isPremium: true } } })).data
  expect(await (await publicList(new Request('http://localhost/api/audio'))).text()).not.toContain(fields.audioUrl)
  mockActor = null; expect(await (await playback(slug)).json()).toMatchObject({ audioUrl: null, locked: true })
  row = (await changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'withdraw' } })).data
  expect((await playback(slug)).status).toBe(404); expect((await (await search(query)).json()).audio.map((item: { id: string }) => item.id)).not.toContain(row.id)
  expect((await getSitemapItems()).some(item => item.url.endsWith(`/audio/${slug}`))).toBe(false)
})
test('blank drafts cannot publish and published tracks cannot lose their media URL', async () => {
  let row = await create({ audioUrl: '' })
  await expect(changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'publish' } })).rejects.toMatchObject({ code: 'INVALID_PUBLICATION' })
  row = (await changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'details', fields: { title: fields.title, description: '', category: fields.category, audioUrl: fields.audioUrl, duration: 300, isPremium: false } } })).data
  row = (await changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'publish' } })).data
  await expect(changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'details', fields: { title: fields.title, description: '', category: fields.category, audioUrl: '', duration: 300, isPremium: false } } })).rejects.toMatchObject({ code: 'INVALID_PUBLICATION' })
  expect((await prisma.audioTrack.findUniqueOrThrow({ where: { id: row.id } })).isPublished).toBe(true)
})
test('stale or competing reviewed edits cannot overwrite a newer track', async () => {
  const row = await create(), fresh = row
  const details = { title: 'First edit', description: '', category: fields.category, audioUrl: fields.audioUrl, duration: 300, isPremium: false }
  const changes = await Promise.allSettled([changeManagedAudio(users[0], { id: row.id, version: fresh.version, change: { action: 'details', fields: details } }), changeManagedAudio(users[0], { id: row.id, version: fresh.version, change: { action: 'details', fields: { ...details, title: 'Second edit' } } })])
  expect(changes.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(changes.filter(result => result.status === 'rejected')).toHaveLength(1)
})
test('slug and id collisions are refused, including competing creates', async () => {
  const row = await create(), input = { ...fields, slug: `race-${randomUUID()}` }
  await expect(createManagedAudio(users[0], { ...fields, slug: row.id })).rejects.toMatchObject({ code: 'SLUG_UNAVAILABLE' })
  await expect(createManagedAudio(users[0], { ...fields, slug: row.slug.toUpperCase() })).rejects.toMatchObject({ code: 'SLUG_UNAVAILABLE' })
  const results = await Promise.allSettled([createManagedAudio(users[0], input), createManagedAudio(users[0], input)])
  for (const result of results) if (result.status === 'fulfilled') tracks.push(result.value.data.id)
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
})
test('bounded status/search lists exclude long media fields and return stable pages', async () => {
  const key = `list-${randomUUID()}`; await create({ title: key }); await create({ title: key }); await create({ title: key })
  const first = await (await GET(new NextRequest(`http://localhost/api/admin/audio?q=${key}&limit=2&status=draft`))).json()
  expect(first.data).toHaveLength(2); expect(first.nextCursor).toBeTruthy(); expect(first.data[0]).not.toHaveProperty('audioUrl')
  const next = await (await GET(new NextRequest(`http://localhost/api/admin/audio?q=${key}&limit=2&cursor=${first.nextCursor}`))).json()
  expect(next.data).toHaveLength(1); expect(next.nextCursor).toBeNull(); expect(first.data.map((item: { id: string }) => item.id)).not.toContain(next.data[0].id)
  expect((await GET(new NextRequest('http://localhost/api/admin/audio?limit=101'))).status).toBe(400)
  expect((await GET(new NextRequest('http://localhost/api/admin/audio?status=all&status=draft'))).status).toBe(400)
})
test('API errors preserve reviewed data and never accept publication or role fields at creation', async () => {
  expect((await POST(request('POST', { ...fields, slug: 'unsupported', isPublished: true }))).status).toBe(400)
  expect((await PATCH(request('PATCH', { id: 'missing', change: { action: 'publish' } }))).status).toBe(400)
  expect((await POST(new NextRequest('http://localhost/api/admin/audio', { method: 'POST', body: '{' }))).status).toBe(400)
})
test('audit failure rolls back metadata edits', async () => {
  const row = await create(), constraint = `qa_audio_${randomUUID().replaceAll('-', '')}`
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "${constraint}" CHECK ("entityId" <> '${row.id}') NOT VALID`)
  try { await expect(changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'publish' } })).rejects.toThrow(); expect(audioAdminDetail(await prisma.audioTrack.findUniqueOrThrow({ where: { id: row.id } }))).toEqual(row) }
  finally { await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${constraint}"`) }
})
test('current administrator role is checked after waiting on the catalog lock', async () => {
  const row = await create(); let release!: () => void, acquired!: () => void
  const ready = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const writer = prisma.$transaction(async tx => { await lockTransaction(tx, 'audio', `catalog:${row.id}`); acquired(); await unlock }, { timeout: 15000 })
  await ready; const operation = changeManagedAudio(users[0], { id: row.id, version: row.version, change: { action: 'publish' } }); void operation.catch(() => {})
  try {
    let blocked = false
    for (let n = 0; n < 200; n++) { const locks = await prisma.$queryRaw<Array<{ blocked: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.datname=current_database() AND l.locktype='advisory' AND NOT l.granted) AS blocked`; if (locks[0].blocked) { blocked = true; break }; await new Promise(resolve => setTimeout(resolve, 20)) }
    expect(blocked).toBe(true)
    await prisma.user.update({ where: { id: users[0] }, data: { role: 'USER' } })
  } finally { release(); await writer }
  try { await expect(operation).rejects.toMatchObject({ code: 'FORBIDDEN' }) } finally { await prisma.user.update({ where: { id: users[0] }, data: { role: 'ADMIN' } }) }
})
test('additive migration preserves a legacy row and leaves it published by default', async () => {
  const sql = await fs.readFile('prisma/migrations/20261106103000_audio_publication/migration.sql', 'utf8')
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('CREATE TEMP TABLE "AudioTrack" (id text PRIMARY KEY, title text, "createdAt" timestamp NOT NULL DEFAULT now()) ON COMMIT DROP')
    await tx.$executeRawUnsafe("INSERT INTO pg_temp.\"AudioTrack\" (id,title) VALUES ('legacy','Existing audio')")
    for (const statement of sql.split(';').map(value => value.trim()).filter(Boolean)) await tx.$executeRawUnsafe(statement)
    const rows = await tx.$queryRaw<Array<{ id: string; title: string; isPublished: boolean }>>`SELECT id,title,"isPublished" FROM pg_temp."AudioTrack"`
    expect(rows).toEqual([{ id: 'legacy', title: 'Existing audio', isPublished: true }])
  })
})
