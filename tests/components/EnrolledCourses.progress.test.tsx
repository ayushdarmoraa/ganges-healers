import React from 'react'
import { render, screen } from '@testing-library/react'
import EnrolledCoursesPage from '@/app/courses/enrolled/page'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'learner' } }, status: 'authenticated' }),
}))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))

let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })

function respondWithEnrollment(completedLessons: number, status = 'active') {
  global.fetch = jest.fn(async () => new Response(JSON.stringify([{
    id: 'enrollment', status, progress: completedLessons + 1, completedLessons,
    course: { id: 'course', slug: 'course', title: 'Test Course', imageUrl: null, _count: { lessons: 5 } },
  }]), { status: 200 })) as typeof fetch
}

test('shows the actual number of completed lessons and percentage', async () => {
  respondWithEnrollment(1)
  render(<EnrolledCoursesPage />)
  expect(await screen.findByRole('link', { name: /test course/i })).toHaveTextContent('1/5 lessons · 20%')
})

test('does not label a legacy premature completion as completed', async () => {
  respondWithEnrollment(4, 'completed')
  render(<EnrolledCoursesPage />)
  expect(await screen.findByRole('link', { name: /test course/i })).toHaveTextContent('4/5 lessons · 80%')
  expect(screen.queryByText(/✓ Completed/)).not.toBeInTheDocument()
})

test('shows completed after every lesson is reached', async () => {
  respondWithEnrollment(5, 'completed')
  render(<EnrolledCoursesPage />)
  expect(await screen.findByRole('link', { name: /test course/i })).toHaveTextContent('5/5 lessons · 100%')
  expect(screen.getByText(/✓ Completed/)).toBeInTheDocument()
})
