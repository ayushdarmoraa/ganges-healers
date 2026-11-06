import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET, POST, PATCH, DELETE } from '@/app/api/admin/courses/route'
import { GET as publicDetail } from '@/app/api/courses/[slug]/route'
import { GET as publicList } from '@/app/api/courses/route'
import { GET as readLesson } from '@/app/api/courses/[slug]/lessons/[lessonId]/route'
import { POST as progress } from '@/app/api/courses/[slug]/progress/route'
import { POST as enroll } from '@/app/api/courses/[slug]/enroll/route'
import { GET as search } from '@/app/api/search/route'
import { changeManagedCourse, createManagedCourse } from '@/lib/courses/admin'
import { lockTransaction } from '@/lib/db/locks'
import type { CourseChange, CourseDetail } from '@/lib/courses/admin-schema'

let mockActor: { user: { id: string; role: string } } | null = null
jest.mock('@/lib/auth', () => ({ auth: jest.fn(async () => mockActor) }))
jest.mock('@/lib/razorpay', () => ({ getRazorpayClient: jest.fn(async () => null) }))
const users: string[] = [], courses: string[] = []
let draft: CourseDetail
const request = (path: string, body?: object) => new NextRequest(`http://localhost${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined)
const fields = { title: 'Authoring Course', description: 'An isolated course overview.', pricePaise: 0, imageUrl: '' }
const lessonFields = { title: 'First lesson', content: 'Private licensed lesson text.', videoUrl: 'https://video.example.test/embed/first' }
const admin = () => { mockActor = { user: { id: users[0], role: 'ADMIN' } } }
const customer = () => { mockActor = { user: { id: users[2], role: 'USER' } } }
const edit = (row: CourseDetail, change: CourseChange) => PATCH(request('/api/admin/courses', { id: row.id, version: row.version, change }))
const fresh = async (id = draft.id) => (await (await GET(request(`/api/admin/courses?id=${id}`))).json()).data as CourseDetail
const view = (slug = draft.slug) => publicDetail(request(`/api/courses/${slug}`), { params: Promise.resolve({ slug }) })
const lesson = (id: string) => readLesson(request('/api/courses/lesson'), { params: Promise.resolve({ slug: draft.slug, lessonId: id }) })
async function add(row = draft) {
  const response = await edit(row, { action: 'add_lesson', fields: lessonFields })
  expect(response.status).toBe(200)
  return (await response.json()).data as CourseDetail
}
async function publish(row: CourseDetail) {
  const response = await edit(row, { action: 'publish' }); expect(response.status).toBe(200)
  return (await response.json()).data as CourseDetail
}
beforeAll(async () => {
  for (const role of ['ADMIN', 'ADMIN', 'USER'] as const) users.push((await prisma.user.create({ data: { email: `authoring-${randomUUID()}@example.test`, role } })).id)
})
beforeEach(async () => {
  admin()
  draft = (await createManagedCourse(users[0], { ...fields, slug: `authoring-${randomUUID()}` })).data
  courses.push(draft.id)
})
afterAll(async () => {
  try {
    await prisma.activityLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.payment.deleteMany({ where: { userId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.course.deleteMany({ where: { id: { in: courses } } })
  } finally { await prisma.$disconnect() }
})

test('drafts start hidden, lists omit lesson text/media, and publication requires a complete curriculum', async () => {
  expect(draft.isActive).toBe(false)
  expect((await view()).status).toBe(404)
  expect((await edit(draft, { action: 'publish' })).status).toBe(400)
  draft = await add()
  const response = await GET(request('/api/admin/courses'))
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(JSON.stringify(await response.json())).not.toContain('Private licensed lesson text')
  expect(JSON.stringify(await (await GET(request('/api/admin/courses'))).json())).not.toContain('video.example.test')
  draft = await publish(draft)
  const body = await (await view()).json()
  expect(body.lessons).toEqual([{ id: draft.lessons[0].id, title: 'First lesson', order: 0 }])
  expect(JSON.stringify(body)).not.toContain('Private licensed lesson text')
})

test('current database roles reject ordinary users and revoked admins without writing', async () => {
  customer()
  expect((await GET(request('/api/admin/courses'))).status).toBe(403)
  expect((await POST(request('/api/admin/courses', { ...fields, slug: `forbidden-${randomUUID()}` }))).status).toBe(403)
  mockActor = { user: { id: users[2], role: 'ADMIN' } }
  expect((await edit(draft, { action: 'archive' })).status).toBe(403)
  await expect(changeManagedCourse(users[2], { id: draft.id, version: draft.version, change: { action: 'archive' } })).rejects.toMatchObject({ status: 403 })
  expect((await prisma.course.findUniqueOrThrow({ where: { id: draft.id } })).isActive).toBe(false)
})

test('one of two competing versions wins, and a stale decision preserves the newer curriculum', async () => {
  const result = await Promise.all([
    changeManagedCourse(users[0], { id: draft.id, version: draft.version, change: { action: 'add_lesson', fields: lessonFields } }).then(() => 200, error => error.status),
    changeManagedCourse(users[1], { id: draft.id, version: draft.version, change: { action: 'details', fields: { ...fields, title: 'Competing title' } } }).then(() => 200, error => error.status),
  ])
  expect(result.sort()).toEqual([200, 409])
  const current = await fresh()
  expect(current.version).not.toBe(draft.version)
  expect((await edit(draft, { action: 'publish' })).status).toBe(409)
  expect((await fresh()).version).toBe(current.version)
})

test('duplicate slugs, malformed bodies, foreign lesson IDs, and unknown write fields are refused', async () => {
  expect((await POST(request('/api/admin/courses', { ...fields, slug: draft.slug.toUpperCase() }))).status).toBe(409)
  expect((await PATCH(new NextRequest('http://localhost/api/admin/courses', { method: 'PATCH', body: '{' }))).status).toBe(400)
  expect((await edit(draft, { action: 'edit_lesson', lessonId: 'foreign', fields: lessonFields })).status).toBe(404)
  expect((await POST(request('/api/admin/courses', { ...fields, slug: 'caller-published', isActive: true }))).status).toBe(400)
  expect((await GET(request('/api/admin/courses?limit=500'))).status).toBe(400)
})

test('lesson reordering is an exact permutation and cannot delete the last public lesson', async () => {
  draft = await add()
  draft = await add(draft)
  const first = draft.lessons[0].id, second = draft.lessons[1].id
  expect((await edit(draft, { action: 'reorder_lessons', lessonIds: [first, first] })).status).toBe(400)
  const moved = await edit(draft, { action: 'reorder_lessons', lessonIds: [second, first] })
  draft = (await moved.json()).data
  expect(draft.lessons.map(row => row.id)).toEqual([second, first])
  draft = (await (await edit(draft, { action: 'delete_lesson', lessonId: first })).json()).data
  draft = await publish(draft)
  expect((await edit(draft, { action: 'delete_lesson', lessonId: second })).status).toBe(409)
})

test.each(['pending_payment', 'active', 'completed'])('%s enrollment protects course history and lesson order while quoted prices remain fixed', async status => {
  draft = await add()
  const reservation = await prisma.courseEnrollment.create({ data: { courseId: draft.id, userId: users[2], pricePaise: 500, status, progress: 1 } })
  expect((await edit(draft, { action: 'add_lesson', fields: lessonFields })).status).toBe(409)
  expect((await edit(draft, { action: 'delete_lesson', lessonId: draft.lessons[0].id })).status).toBe(409)
  expect((await edit(draft, { action: 'reorder_lessons', lessonIds: [draft.lessons[0].id] })).status).toBe(409)
  expect((await DELETE(request('/api/admin/courses', { id: draft.id, version: draft.version }))).status).toBe(409)
  const updated = await edit(draft, { action: 'details', fields: { ...fields, pricePaise: 90000 } })
  expect(updated.status).toBe(200)
  draft = (await updated.json()).data
  expect((await edit(draft, { action: 'edit_lesson', lessonId: draft.lessons[0].id, fields: { ...lessonFields, content: 'Corrected licensed text.' } })).status).toBe(200)
  expect(await prisma.courseEnrollment.findUniqueOrThrow({ where: { id: reservation.id } })).toMatchObject({ pricePaise: 500, progress: 1, status })
})

test('orphaned course-payment metadata also prevents destructive curriculum edits', async () => {
  await prisma.payment.create({ data: { userId: users[2], type: 'COURSE', gateway: 'razorpay', status: 'pending', statusEnum: 'PENDING', amountPaise: 100, metadata: { courseId: draft.id, enrollmentId: 'legacy-missing-enrollment' } } })
  expect((await DELETE(request('/api/admin/courses', { id: draft.id, version: draft.version }))).status).toBe(409)
  expect((await edit(draft, { action: 'add_lesson', fields: lessonFields })).status).toBe(409)
})

test('archiving stops discovery and new purchases while enrolled students can resume lessons and progress', async () => {
  draft = await publish(await add())
  await prisma.courseEnrollment.create({ data: { courseId: draft.id, userId: users[2], status: 'active', pricePaise: 0 } })
  draft = (await (await edit(draft, { action: 'archive' })).json()).data
  mockActor = null
  expect((await view()).status).toBe(404)
  const listed = await (await publicList()).json()
  expect(JSON.stringify(listed)).not.toContain(draft.slug)
  expect((await lesson(draft.lessons[0].id)).status).toBe(401)
  customer()
  const visible = await view()
  expect(visible.status).toBe(200)
  expect(visible.headers.get('cache-control')).toBe('private, no-store')
  expect((await lesson(draft.lessons[0].id)).status).toBe(200)
  const completed = await progress(request('/api/courses/progress', { lessonOrder: draft.lessons[0].order }), { params: Promise.resolve({ slug: draft.slug }) })
  expect(await completed.json()).toMatchObject({ status: 'completed', progress: 1 })
  expect((await enroll(request('/api/courses/enroll'), { params: Promise.resolve({ slug: draft.slug }) })).status).toBe(404)
})

test('an unpurchased archived draft can be deleted without changing another course', async () => {
  draft = await add()
  const deleted = await DELETE(request('/api/admin/courses', { id: draft.id, version: draft.version }))
  expect(deleted.status).toBe(200)
  expect(await deleted.json()).toMatchObject({ success: true, data: { id: draft.id, deleted: true } })
  expect(await prisma.courseLesson.count({ where: { courseId: draft.id } })).toBe(0)
  expect(await prisma.course.count({ where: { id: { in: courses.filter(id => id !== draft.id) } } })).toBeGreaterThan(0)
})

test('course search reads publication state freshly after a cached search and archive', async () => {
  const term = `coursequartz${randomUUID().replace(/-/g, '')}`
  draft = (await (await edit(draft, { action: 'details', fields: { ...fields, title: `Course ${term}` } })).json()).data
  draft = await publish(await add())
  expect((await (await search(request(`/api/search?q=${term}`))).json()).courses.map((row: { id: string }) => row.id)).toContain(draft.id)
  draft = (await (await edit(draft, { action: 'archive' })).json()).data
  expect((await (await search(request(`/api/search?q=${term}`))).json()).courses).toEqual([])
})

test('enrollment waits on the catalog lock and rereads archive state before creating a quote', async () => {
  draft = await publish(await add())
  customer()
  let acquired!: () => void, release!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const blocker = prisma.$transaction(async tx => {
    await lockTransaction(tx, 'course', `catalog:${draft.id}`); acquired(); await unlock
    await tx.course.update({ where: { id: draft.id }, data: { isActive: false } })
  }, { timeout: 15000 })
  await locked
  const waitingEnrollment = enroll(request('/api/courses/enroll'), { params: Promise.resolve({ slug: draft.slug }) })
  try {
    let waiting = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=72106::oid AND objid=(hashtext(${'catalog:' + draft.id})::bigint & 4294967295)::oid) AS waiting`
      if (rows[0].waiting) { waiting = true; break }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(waiting).toBe(true)
  } finally { release(); await blocker; await waitingEnrollment }
  expect((await waitingEnrollment).status).toBe(404)
  expect(await prisma.courseEnrollment.count({ where: { courseId: draft.id } })).toBe(0)
})
