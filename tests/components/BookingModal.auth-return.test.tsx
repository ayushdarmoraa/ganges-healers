import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingModal from '@/components/booking/BookingModal'
import { clinicDate } from '@/lib/bookings/time'

const mockPush = jest.fn()
const mockSession = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('next-auth/react', () => ({ useSession: () => mockSession() }))
const priorTestMode = process.env.TEST_MODE
const priorPublicTestMode = process.env.NEXT_PUBLIC_TEST_MODE
const priorFetch = global.fetch
const priorUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
beforeEach(() => {
  delete process.env.TEST_MODE
  delete process.env.NEXT_PUBLIC_TEST_MODE
  mockPush.mockClear()
  mockSession.mockReturnValue({ data: null, status: 'unauthenticated' })
  window.history.replaceState({}, '', '/services/reiki-healing?healerId=old-selection&programSlug=foundation')
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ data: { slots: [{ time: '11:00', available: true }] } }), { status: 200 }))
})
afterEach(() => {
  if (priorTestMode === undefined) delete process.env.TEST_MODE
  else process.env.TEST_MODE = priorTestMode
  if (priorPublicTestMode === undefined) delete process.env.NEXT_PUBLIC_TEST_MODE
  else process.env.NEXT_PUBLIC_TEST_MODE = priorPublicTestMode
  global.fetch = priorFetch
  window.history.replaceState({}, '', priorUrl)
})
async function chooseSlot() {
  render(<BookingModal isOpen onClose={() => {}} healer={{ id: 'chosen-healer', user: { name: 'Chosen Practitioner' }, experienceYears: 5, rating: 4 }} serviceId="service" serviceName="Reiki Healing" productSlug="copper-bottle" />)
  fireEvent.change(screen.getByLabelText('Select Date'), { target: { value: clinicDate(new Date(Date.now() + 3 * 86400000)) } })
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '11:00 AM' }))
  return user
}

test('signed-out booking returns to the chosen practitioner and preserves journey context without reserving a slot', async () => {
  const user = await chooseSlot()
  await user.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1))
  const signin = new URL(mockPush.mock.calls[0][0], 'https://example.test')
  expect(signin.pathname).toBe('/auth/signin')
  const callback = new URL(signin.searchParams.get('callbackUrl')!, 'https://example.test')
  expect(callback.pathname).toBe('/services/reiki-healing')
  expect(callback.searchParams.getAll('healerId')).toEqual(['chosen-healer'])
  expect(callback.searchParams.get('openBooking')).toBe('1')
  expect(callback.searchParams.get('programSlug')).toBe('foundation')
  expect(callback.searchParams.get('productSlug')).toBe('copper-bottle')
  expect(jest.mocked(global.fetch).mock.calls.every(([url]) => String(url).startsWith('/api/availability?'))).toBe(true)
})

test('a session object with no customer ID still requires sign-in', async () => {
  mockSession.mockReturnValue({ data: { user: { name: 'Incomplete session' } }, status: 'authenticated' })
  const user = await chooseSlot()
  await user.click(screen.getByRole('button', { name: 'Confirm & Pay' }))
  expect(mockPush).toHaveBeenCalledTimes(1)
  expect(jest.mocked(global.fetch).mock.calls.some(([url]) => url === '/api/bookings')).toBe(false)
})

test('a loading session cannot trigger a premature sign-in redirect or booking', async () => {
  mockSession.mockReturnValue({ data: null, status: 'loading' })
  await chooseSlot()
  expect(screen.getByRole('button', { name: 'Confirm & Pay' })).toBeDisabled()
  expect(mockPush).not.toHaveBeenCalled()
  expect(jest.mocked(global.fetch).mock.calls.some(([url]) => url === '/api/bookings')).toBe(false)
})
