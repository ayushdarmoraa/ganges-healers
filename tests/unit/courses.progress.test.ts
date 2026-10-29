import { POST as recordProgress } from '@/app/api/courses/[slug]/progress/route'
import { GET as listEnrollments } from '@/app/api/courses/enrollments/me/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  course: { findFirst: jest.fn() },
  courseEnrollment: { findFirst: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
} }))

const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const logActivity = jest.requireMock<{ logActivity: jest.Mock }>('@/lib/activity-log').logActivity
const db = jest.requireMock<{ prisma: {
  course: { findFirst: jest.Mock }
  courseEnrollment: { findFirst: jest.Mock; updateMany: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock }
} }>('@/lib/prisma').prisma
const params = { params: Promise.resolve({ slug: 'course' }) }
const lessons = [1, 2, 3, 4, 5].map(order => ({ order }))
const request = (lessonOrder: number) => new Request('http://localhost/api/courses/course/progress', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lessonOrder }),
})

beforeEach(() => {
  jest.resetAllMocks()
  auth.mockResolvedValue({ user: { id: 'learner' } })
  db.course.findFirst.mockResolvedValue({ id: 'course-id', lessons })
  db.courseEnrollment.findFirst.mockResolvedValue({ id: 'enrollment', progress: 0, status: 'active' })
  db.courseEnrollment.updateMany.mockResolvedValue({ count: 1 })
  db.courseEnrollment.findUnique.mockResolvedValue({ id: 'enrollment', progress: 2, status: 'active' })
})

test.each([1, 4])('lesson %i does not complete a five-lesson, one-based course', async lessonOrder => {
  db.courseEnrollment.findUnique.mockResolvedValue({ progress: lessonOrder + 1, status: 'active' })
  const response = await recordProgress(request(lessonOrder), params)
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ progress: lessonOrder + 1, status: 'active' })
  expect(db.courseEnrollment.updateMany).toHaveBeenCalledWith({
    where: { id: 'enrollment', progress: { lt: lessonOrder + 1 }, status: { in: ['active', 'completed'] } },
    data: { progress: lessonOrder + 1 },
  })
})

test('only the final lesson reaches the completion threshold', async () => {
  db.courseEnrollment.findUnique.mockResolvedValue({ progress: 6, status: 'completed' })
  const response = await recordProgress(request(5), params)
  expect(await response.json()).toEqual({ progress: 6, status: 'completed' })
  expect(db.courseEnrollment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: { progress: 6, status: 'completed' },
  }))
})

test.each([0, 6, 2147483647])('rejects nonexistent or unrepresentable lesson order %i', async lessonOrder => {
  const response = await recordProgress(request(lessonOrder), params)
  expect(response.status).toBe(400)
  expect(db.courseEnrollment.updateMany).not.toHaveBeenCalled()
})

test('a stale request returns the later saved progress instead of overwriting it', async () => {
  db.courseEnrollment.updateMany.mockResolvedValue({ count: 0 })
  db.courseEnrollment.findUnique.mockResolvedValue({ progress: 6, status: 'completed' })
  const response = await recordProgress(request(1), params)
  expect(await response.json()).toEqual({ progress: 6, status: 'completed' })
  expect(logActivity).not.toHaveBeenCalled()
})

test('requires an authenticated, active enrollment', async () => {
  auth.mockResolvedValueOnce(null)
  expect((await recordProgress(request(1), params)).status).toBe(401)
  db.courseEnrollment.findFirst.mockResolvedValueOnce(null)
  expect((await recordProgress(request(1), params)).status).toBe(403)
  expect(db.courseEnrollment.updateMany).not.toHaveBeenCalled()
})

test.each([
  [0, 0],
  [2, 1],
  [5, 4],
  [6, 5],
])('returns %i stored progress as %i completed lessons', async (progress, completedLessons) => {
  db.courseEnrollment.findMany.mockResolvedValue([{
    id: 'enrollment', progress, course: { id: 'course-id', lessons, _count: { lessons: 5 } },
  }])
  const response = await listEnrollments()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual([{
    id: 'enrollment', progress, completedLessons, course: { id: 'course-id', _count: { lessons: 5 } },
  }])
})

test('counts actual lesson orders when they are sparse or zero-based', async () => {
  db.courseEnrollment.findMany.mockResolvedValue([{
    id: 'enrollment', progress: 4,
    course: { id: 'course-id', lessons: [{ order: 0 }, { order: 3 }, { order: 10 }], _count: { lessons: 3 } },
  }])
  expect(await (await listEnrollments()).json()).toEqual([{
    id: 'enrollment', progress: 4, completedLessons: 2, course: { id: 'course-id', _count: { lessons: 3 } },
  }])
})
