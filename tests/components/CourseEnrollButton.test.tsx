import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'
import CourseEnrollButton from '@/components/courses/CourseEnrollButton'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('@/lib/payments/openRazorpayCheckout', () => ({ openRazorpayCheckout: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const push = jest.fn()
const course = { id: 'course', slug: 'test-course', title: 'Test Course', description: 'Test', pricePaise: 0, imageUrl: null, lessons: [{ id: 'lesson', title: 'First lesson', order: 1 }], _count: { enrollments: 0 } }
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status }) }
const paid = { orderId: 'order_saved', amountPaise: 15000, key: 'public_test_key', enrollmentId: 'enrollment' }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useRouter).mockReturnValue({ push } as never)
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'owner', email: 'owner@example.test' } }, status: 'authenticated' } as never)
})
afterEach(() => jest.restoreAllMocks())

test('free enrollment enters the first lesson without opening payment checkout', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => options?.method === 'POST' ? response({ enrolled: true, amountPaise: 0, enrollmentId: 'enrollment' }) : response([]))
  const user = userEvent.setup()
  render(<CourseEnrollButton course={course} />)
  await user.click(screen.getByRole('button', { name: 'Enroll for free' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/courses/test-course/lesson/lesson'))
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalledWith('/api/payments/verify', expect.anything())
})

test('a course without lessons goes to My Courses instead of an undefined lesson URL', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response([{ courseId: 'course' }]))
  const user = userEvent.setup()
  render(<CourseEnrollButton course={{ ...course, lessons: [] }} />)
  await user.click(await screen.findByRole('button', { name: 'View My Courses' }))
  expect(push).toHaveBeenCalledWith('/courses/enrolled')
})

test('an existing completed enrollment can recover access from the server response', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => options?.method === 'POST' ? response({ error: 'Already enrolled', enrolled: true, enrollmentId: 'enrollment' }, 409) : response([]))
  const user = userEvent.setup()
  render(<CourseEnrollButton course={course} />)
  await user.click(screen.getByRole('button', { name: 'Enroll for free' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/courses/test-course/lesson/lesson'))
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})

test('dismissed checkout can resume the same order', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => options?.method === 'POST' ? response({ ...paid, resumed: true }) : response([]))
  jest.mocked(openRazorpayCheckout).mockRejectedValue(new Error('Payment dismissed'))
  const user = userEvent.setup()
  render(<CourseEnrollButton course={{ ...course, pricePaise: 15000 }} />)
  await user.click(screen.getByRole('button', { name: 'Enroll — ₹150.00' }))
  const retry = await screen.findByRole('button', { name: 'Continue checkout' })
  await waitFor(() => expect(retry).toBeEnabled())
  await user.click(retry)
  await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalledTimes(2))
  for (const [options] of jest.mocked(openRazorpayCheckout).mock.calls) expect(options.orderId).toBe('order_saved')
})

test('signed-out customers return to the selected course after sign-in', async () => {
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated' } as never)
  const fetch = jest.spyOn(globalThis, 'fetch')
  const user = userEvent.setup()
  render(<CourseEnrollButton course={course} />)
  await user.click(screen.getByRole('button', { name: 'Enroll for free' }))
  expect(push).toHaveBeenCalledWith(`/auth/signin?${new URLSearchParams({ callbackUrl: '/courses/test-course' })}`)
  expect(fetch).not.toHaveBeenCalled()
})

test('a loading session cannot accidentally start anonymous checkout', async () => {
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'loading' } as never)
  const fetch = jest.spyOn(globalThis, 'fetch')
  render(<CourseEnrollButton course={course} />)
  expect(screen.getByRole('button', { name: 'Processing…' })).toBeDisabled()
  expect(push).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

test('malformed enrollment data does not grant access or open the gateway', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => options?.method === 'POST' ? response({ enrolled: true, amountPaise: 0 }) : response([]))
  const user = userEvent.setup()
  render(<CourseEnrollButton course={course} />)
  await user.click(screen.getByRole('button', { name: 'Enroll for free' }))
  await waitFor(() => expect(jest.requireMock<{ toast: { error: jest.Mock } }>('sonner').toast.error).toHaveBeenCalledWith('Checkout could not be prepared. Please try again.'))
  expect(push).not.toHaveBeenCalled()
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})

test('an unconfirmed payment verification never reports enrollment success', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => String(url) === '/api/payments/verify' ? response({ ok: true }) : options?.method === 'POST' ? response(paid) : response([]))
  jest.mocked(openRazorpayCheckout).mockResolvedValue({ razorpay_order_id: 'order_saved', razorpay_payment_id: 'payment', razorpay_signature: 'signature' })
  const user = userEvent.setup()
  render(<CourseEnrollButton course={{ ...course, pricePaise: 15000 }} />)
  await user.click(screen.getByRole('button', { name: 'Enroll — ₹150.00' }))
  await waitFor(() => expect(jest.requireMock<{ toast: { error: jest.Mock } }>('sonner').toast.error).toHaveBeenCalledWith(expect.stringContaining('verification could not be confirmed')))
  expect(push).not.toHaveBeenCalled()
})
