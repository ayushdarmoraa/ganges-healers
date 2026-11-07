import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LessonPlayer from '@/components/courses/LessonPlayer'
import { toast } from 'sonner'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'learner' } }, status: 'authenticated' }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const mockRouter = { push: jest.fn() }
const lessons = [1, 2, 3, 4, 5].map(order => ({ id: `lesson-${order}`, title: `Lesson ${order}`, order }))
let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })
beforeEach(() => { jest.clearAllMocks() })

function respondForLesson(order: number) {
  global.fetch = jest.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = init?.method === 'POST'
      ? { progress: order + 1, status: 'completed' }
      : { lesson: { ...lessons[order - 1], courseId: 'course', videoUrl: null, content: null }, allLessons: lessons, enrollment: { progress: order } }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as typeof fetch
}

test('does not announce a legacy premature completion before the last lesson', async () => {
  respondForLesson(4)
  const user = userEvent.setup()
  render(<LessonPlayer courseSlug="course" lessonId="lesson-4" />)
  await user.click(await screen.findByRole('button', { name: 'Mark Complete & Continue' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Lesson completed!'))
  expect(toast.success).not.toHaveBeenCalledWith('Course completed! 🎉')
})

test('announces completion after the final lesson', async () => {
  respondForLesson(5)
  const user = userEvent.setup()
  render(<LessonPlayer courseSlug="course" lessonId="lesson-5" />)
  await user.click(await screen.findByRole('button', { name: 'Mark Complete & Continue' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Course completed! 🎉'))
})
