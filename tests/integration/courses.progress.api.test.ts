import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { POST as recordProgress } from '@/app/api/courses/[slug]/progress/route'
import { GET as listEnrollments } from '@/app/api/courses/enrollments/me/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))

const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
let userId: string
let courseId: string
let courseSlug: string
let enrollmentId: string
const request = (lessonOrder: number) => new Request('http://localhost/api/courses/progress', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lessonOrder }),
})
const params = () => ({ params: Promise.resolve({ slug: courseSlug }) })

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `course-progress-${crypto.randomUUID()}@example.test`, role: 'USER' } })
  userId = user.id
  courseSlug = `course-progress-${crypto.randomUUID()}`
  const course = await prisma.course.create({ data: {
    slug: courseSlug, title: 'Progress Test', description: 'Progress Test', pricePaise: 1000,
    lessons: { create: [1, 2, 3, 4, 5].map(order => ({ order, title: `Lesson ${order}` })) },
  } })
  courseId = course.id
  const enrollment = await prisma.courseEnrollment.create({ data: { userId, courseId, status: 'active' } })
  enrollmentId = enrollment.id
})

beforeEach(async () => {
  auth.mockResolvedValue({ user: { id: userId } })
  await prisma.courseEnrollment.update({ where: { id: enrollmentId }, data: { progress: 0, status: 'active' } })
})

afterAll(async () => {
  if (courseId) await prisma.course.delete({ where: { id: courseId } })
  if (userId) await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

test('tracks each one-based lesson and completes only after the last', async () => {
  for (let order = 1; order <= 5; order++) {
    const response = await recordProgress(request(order), params())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ progress: order + 1, status: order === 5 ? 'completed' : 'active' })
    const enrollments = await (await listEnrollments()).json()
    expect(enrollments[0]).toMatchObject({ id: enrollmentId, completedLessons: order, progress: order + 1 })
  }
})

test('rejects an order outside the course without changing progress', async () => {
  expect((await recordProgress(request(99), params())).status).toBe(400)
  expect(await prisma.courseEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } }))
    .toMatchObject({ progress: 0, status: 'active' })
})

test('simultaneous updates cannot move saved progress backwards', async () => {
  const responses = await Promise.all([recordProgress(request(5), params()), recordProgress(request(1), params())])
  expect(responses.map(response => response.status)).toEqual([200, 200])
  expect(await prisma.courseEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } }))
    .toMatchObject({ progress: 6, status: 'completed' })
})

test('does not let another user update the enrollment', async () => {
  auth.mockResolvedValue({ user: { id: 'not-the-owner' } })
  expect((await recordProgress(request(1), params())).status).toBe(403)
  expect(await prisma.courseEnrollment.findUniqueOrThrow({ where: { id: enrollmentId } }))
    .toMatchObject({ progress: 0, status: 'active' })
})
