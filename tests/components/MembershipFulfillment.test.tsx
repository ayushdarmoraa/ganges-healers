import { act, render, screen } from '@testing-library/react'
import MembershipPage from '@/app/dashboard/membership/page'
import { useSession } from 'next-auth/react'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
const update = jest.fn().mockResolvedValue({})
const fetchMock = jest.fn()
const membership = { id: 'owned', status: 'pending', plan: { title: 'VIP Monthly', pricePaise: 19900, interval: 'MONTHLY' } }
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'customer', role: 'USER', vip: false, freeSessionCredits: 0 }, expires: '2027-01-01' }, status: 'authenticated', update })
  global.fetch = fetchMock
})
afterEach(() => jest.useRealTimers())

test('pending checkout remains recoverable, polls for paid access, and refreshes session claims', async () => {
  jest.useFakeTimers()
  let reads = 0
  fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => {
    if (url === '/api/memberships/me') return { membership: { ...membership, status: ++reads === 1 ? 'pending' : 'active' }, credits: { total: reads === 1 ? 0 : 2 } }
    if (url === '/api/memberships/plans') return { plans: [{ slug: 'vip-monthly', ...membership.plan, benefits: { freeSessions: 2 } }] }
    return { invoices: [] }
  } }))
  render(<MembershipPage />)
  expect(await screen.findByRole('button', { name: 'Continue checkout' })).toBeEnabled()
  expect(screen.getByText('Credits: 0')).toBeVisible()
  await act(async () => { await jest.advanceTimersByTimeAsync(4000) })
  expect(screen.getByText('Credits: 2')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Continue checkout' })).not.toBeInTheDocument()
  expect(update).toHaveBeenCalledTimes(2)
  await act(async () => { await jest.advanceTimersByTimeAsync(12000) })
  expect(reads).toBe(2)
})

test('signed-out visitors sign in with a membership return link before checkout', async () => {
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated', update })
  fetchMock.mockImplementation(async (url: string) => ({ ok: url === '/api/memberships/plans', json: async () => ({ plans: [{ slug: 'vip-monthly', ...membership.plan, benefits: { freeSessions: 2 } }] }) }))
  render(<MembershipPage />)
  const link = await screen.findByRole('link', { name: 'Sign in to subscribe' })
  expect(link).toHaveAttribute('href', '/auth/signin?callbackUrl=%2Fdashboard%2Fmembership')
  expect(screen.queryByRole('button', { name: /^Subscribe$/ })).not.toBeInTheDocument()
  expect(fetchMock.mock.calls.every(([url]) => url !== '/api/memberships/subscribe')).toBe(true)
})

test('a changing NextAuth update callback cannot restart membership and plan loading', async () => {
  jest.mocked(useSession).mockImplementation(() => ({
    data: { user: { id: 'customer', role: 'USER', vip: false, freeSessionCredits: 0 }, expires: '2027-01-01' },
    status: 'authenticated', update: async () => update(),
  }))
  fetchMock.mockImplementation(async (url: string) => ({ ok: true, json: async () => {
    if (url === '/api/memberships/me') return { membership: { ...membership, status: 'active' }, credits: { total: 2 } }
    if (url === '/api/memberships/plans') return { plans: [] }
    return { invoices: [] }
  } }))
  const { rerender } = render(<MembershipPage />)
  expect(await screen.findByText('Credits: 2')).toBeVisible()
  await act(async () => { rerender(<MembershipPage />) })
  expect(update).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/memberships/me')).toHaveLength(1)
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/memberships/plans')).toHaveLength(1)
})
