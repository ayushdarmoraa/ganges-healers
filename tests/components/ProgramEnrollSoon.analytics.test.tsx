import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'

import ProgramEnrollSoon from '@/components/features/programs/ProgramEnrollSoon'

jest.mock('@/lib/analytics/client', () => ({
  track: jest.fn(),
}))
jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
jest.mock('@/lib/payments/openRazorpayCheckout', () => ({ openRazorpayCheckout: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const { track } = jest.requireMock('@/lib/analytics/client') as { track: jest.Mock }
const push = jest.fn()
const paid = { orderId: 'order_saved', enrollmentId: 'enrollment', amountPaise: 25000, key: 'public_test_key' }
const component = <ProgramEnrollSoon programSlug="abc" programTitle="Test Program" pricePaise={25000} />
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }) }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'u1', email: 'owner@example.test' } }, status: 'authenticated' } as never)
  jest.mocked(useRouter).mockReturnValue({ push } as never)
})
afterEach(() => jest.restoreAllMocks())

describe('ProgramEnrollSoon analytics', () => {
  test('click fires program_enroll_click with expected payload', async () => {
    const user = userEvent.setup()
    // Use existing jsdom location and append a query for stability
    const originalHref = window.location.href
    window.history.pushState({}, '', '/programs/abc?ref=test')

    // Mock fetch to prevent actual API calls
    global.fetch = jest.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'test' }) }) as jest.Mock

    render(<ProgramEnrollSoon programSlug="abc" programTitle="Test Program" pricePaise={50000} serviceSlug="svc-1" />)

    const btn = screen.getByRole('button', { name: /enroll now/i })
    await user.click(btn)

    expect(track).toHaveBeenCalledTimes(1)
    const [event, props] = track.mock.calls[0]
    expect(event).toBe('program_enroll_click')
    expect(props).toMatchObject({ programSlug: 'abc', serviceSlug: 'svc-1' })
    expect(typeof props.ts).toBe('number')
    expect(props.path).toBe('/programs/abc?ref=test')
    // restore
    window.history.replaceState({}, '', originalHref)
  })
})

test('program checkout preserves the selected destination through sign-in', async () => {
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated' } as never)
  const fetch = jest.spyOn(globalThis, 'fetch')
  render(component)
  await userEvent.click(screen.getByRole('button', { name: 'Enroll Now' }))
  expect(push).toHaveBeenCalledWith(`/auth/signin?${new URLSearchParams({ callbackUrl: '/programs/abc' })}`)
  expect(fetch).not.toHaveBeenCalled()
})

test('program checkout waits until the session has loaded', () => {
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'loading' } as never)
  const fetch = jest.spyOn(globalThis, 'fetch')
  render(component)
  expect(screen.getByRole('button', { name: 'Processing…' })).toBeDisabled()
  expect(fetch).not.toHaveBeenCalled()
})

test('dismissed program checkout can continue with its saved provider order', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ ...paid, resumed: true }))
  jest.mocked(openRazorpayCheckout).mockRejectedValue(new Error('Payment dismissed'))
  render(component)
  await userEvent.click(screen.getByRole('button', { name: 'Enroll Now' }))
  const retry = await screen.findByRole('button', { name: 'Continue checkout' })
  await waitFor(() => expect(retry).toBeEnabled())
  await userEvent.click(retry)
  await waitFor(() => expect(openRazorpayCheckout).toHaveBeenCalledTimes(2))
  for (const [options] of jest.mocked(openRazorpayCheckout).mock.calls) expect(options.orderId).toBe('order_saved')
})

test('an already enrolled program customer goes to the dashboard without another charge', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ enrolled: true, enrollmentId: 'enrollment' }, 409))
  render(component)
  await userEvent.click(screen.getByRole('button', { name: 'Enroll Now' }))
  await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/programs'))
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})

test('malformed program checkout data never opens the provider', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ amountPaise: 0 }))
  render(component)
  await userEvent.click(screen.getByRole('button', { name: 'Enroll Now' }))
  expect(await screen.findByText('Checkout could not be prepared. Please try again.')).toBeInTheDocument()
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})

test('an unconfirmed program verification never claims enrollment success', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async url => response(String(url) === '/api/payments/verify' ? { ok: true } : paid))
  jest.mocked(openRazorpayCheckout).mockResolvedValue({ razorpay_order_id: 'order_saved', razorpay_payment_id: 'payment', razorpay_signature: 'signature' })
  render(component)
  await userEvent.click(screen.getByRole('button', { name: 'Enroll Now' }))
  expect(await screen.findByText(/verification could not be confirmed/)).toBeInTheDocument()
  expect(screen.queryByText('Enrolled successfully!')).not.toBeInTheDocument()
  expect(push).not.toHaveBeenCalled()
})

test('a verified program payment shows confirmed access', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async url => response(String(url) === '/api/payments/verify' ? { verified: true } : paid))
  jest.mocked(openRazorpayCheckout).mockResolvedValue({ razorpay_order_id: 'order_saved', razorpay_payment_id: 'payment', razorpay_signature: 'signature' })
  render(component)
  await userEvent.click(screen.getByRole('button', { name: 'Enroll Now' }))
  expect(await screen.findByText('Enrolled successfully!')).toBeInTheDocument()
})
