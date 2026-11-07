import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import HealerBookingsPage from '@/app/healer/bookings/page'
import BookingCard from '@/components/bookings/BookingCard'
import MyBookingsPage from '@/app/dashboard/bookings/page'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
const booking = () => ({ id: 'booking', scheduledAt: new Date(Date.now() + 86400000).toISOString(), durationMin: 60, status: 'CONFIRMED', pricePaise: 1000, meetingLink: null, updatedAt: '2026-11-01T00:00:00.000Z', service: { name: 'Sound Healing', category: 'Test', slug: 'sound-healing', duration: 60 }, user: { id: 'customer', name: 'Customer', email: 'customer@example.test', image: null }, payment: { gateway: 'vip_credit', status: 'success', statusEnum: null, amountPaise: 0 } })
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status })
let row: ReturnType<typeof booking>, savedFetch: typeof fetch
beforeAll(() => { savedFetch = global.fetch })
afterAll(() => { global.fetch = savedFetch })
beforeEach(() => {
  jest.clearAllMocks(); row = booking()
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'healer-user', role: 'HEALER' } }, status: 'authenticated' } as ReturnType<typeof useSession>)
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const input = JSON.parse(String(init.body))
      return response({ success: true, data: { ...row, meetingLink: input.action === 'SET_MEETING_LINK' ? input.meetingLink : row.meetingLink, status: input.action === 'COMPLETE' ? 'COMPLETED' : row.status, updatedAt: new Date().toISOString() } })
    }
    return response({ success: true, data: [row] })
  }) as typeof fetch
})

test('a healer saves a versioned link and sees its confirmed join action', async () => {
  const user = userEvent.setup(); render(<HealerBookingsPage />)
  const field = await screen.findByLabelText('Session link for Sound Healing')
  await user.type(field, 'https://meeting.example.test/session')
  await user.click(screen.getByRole('button', { name: 'Save session link' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Session link saved'))
  expect(screen.getByRole('link', { name: 'Join session' })).toHaveAttribute('href', 'https://meeting.example.test/session')
  const sent = (fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'PATCH')
  expect(JSON.parse(sent[1].body)).toEqual({ action: 'SET_MEETING_LINK', meetingLink: 'https://meeting.example.test/session', version: row.updatedAt })
  expect(screen.getByRole('button', { name: 'Save session link' })).toBeDisabled()
})

test('a stale link save preserves the draft until the healer explicitly reloads bookings', async () => {
  const user = userEvent.setup(); render(<HealerBookingsPage />)
  const field = await screen.findByLabelText('Session link for Sound Healing')
  await user.type(field, 'https://meeting.example.test/my-draft')
  const implementation = (fetch as jest.Mock).getMockImplementation()!
  ;(fetch as jest.Mock).mockImplementation((url, init) => init?.method === 'PATCH' ? Promise.resolve(response({ error: 'Booking changed. Your link draft is preserved.' }, 409)) : implementation(url, init))
  await user.click(screen.getByRole('button', { name: 'Save session link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Booking changed')
  expect(field).toHaveValue('https://meeting.example.test/my-draft')
  expect(toast.success).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Discard link draft and reload bookings' }))
  expect(await screen.findByLabelText('Session link for Sound Healing')).toHaveValue('')
})

test('failed loads have a retry and do not masquerade as an empty booking list', async () => {
  ;(fetch as jest.Mock).mockResolvedValue(response({ error: 'Bookings unavailable' }, 503))
  render(<HealerBookingsPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Bookings unavailable')
  expect(screen.queryByText('No bookings')).not.toBeInTheDocument()
  ;(fetch as jest.Mock).mockResolvedValue(response({ success: true, data: [row] }))
  await userEvent.click(screen.getByRole('button', { name: 'Retry bookings' }))
  expect(await screen.findByLabelText('Session link for Sound Healing')).toBeVisible()
})

test('malformed successful writes preserve the link and never report an unconfirmed save', async () => {
  const user = userEvent.setup(); render(<HealerBookingsPage />)
  const field = await screen.findByLabelText('Session link for Sound Healing')
  await user.type(field, 'https://meeting.example.test/unsaved')
  ;(fetch as jest.Mock).mockResolvedValue(response({ success: true }))
  await user.click(screen.getByRole('button', { name: 'Save session link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('not confirmed')
  expect(field).toHaveValue('https://meeting.example.test/unsaved')
  expect(toast.success).not.toHaveBeenCalled()
})

test('a future session cannot be completed or have its applied credit silently discarded', async () => {
  render(<HealerBookingsPage />)
  expect(await screen.findByRole('button', { name: 'Complete session' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Cancel unpaid booking' })).not.toBeInTheDocument()
  expect(screen.getByText(/Paid sessions and used credits require administrator review/)).toBeVisible()
})

test('an ended rescheduled session has a working completion action', async () => {
  row = { ...row, status: 'RESCHEDULED', scheduledAt: new Date(Date.now() - 7200000).toISOString() }
  const user = userEvent.setup(); render(<HealerBookingsPage />)
  await user.click(await screen.findByRole('tab', { name: 'Past (1)' }))
  await user.click(screen.getByRole('button', { name: 'Complete session' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Session marked completed'))
  expect(screen.getByText('COMPLETED')).toBeVisible()
})

test.each([['CONFIRMED', 'https://meeting.example.test/join', true], ['CANCELLED', 'https://meeting.example.test/join', false], ['CONFIRMED', 'javascript:alert(1)', false]])('customer join controls respect %s status and safe links', (status, meetingLink, visible) => {
  render(<BookingCard booking={{ id: 'booking', serviceSlug: 'sound', serviceName: 'Sound Healing', healerName: 'Healer', startIso: new Date().toISOString(), status: status as 'CONFIRMED' | 'CANCELLED', isCancelable: false, isReschedulable: false, healerId: 'healer', serviceId: 'service', amountPaise: 1000, meetingLink }} onCancel={jest.fn()} onReschedule={jest.fn()} />)
  const link = screen.queryByRole('link', { name: 'Join session' })
  if (visible) { expect(link).toHaveAttribute('href', meetingLink); expect(link).toHaveAttribute('rel', 'noopener noreferrer') }
  else expect(link).not.toBeInTheDocument()
})

test('switching away from a healer account clears private session links', async () => {
  const view = render(<HealerBookingsPage />)
  await screen.findByLabelText('Session link for Sound Healing')
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'customer', role: 'USER' } }, status: 'authenticated' } as ReturnType<typeof useSession>)
  view.rerender(<HealerBookingsPage />)
  await waitFor(() => expect(screen.queryByLabelText('Session link for Sound Healing')).not.toBeInTheDocument())
  expect(within(screen.getByRole('alert')).getByText(/Sign in with your healer account/)).toBeVisible()
})

test('customer account switches clear saved join links while the next account loads', async () => {
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'customer', role: 'USER' } }, status: 'authenticated' } as ReturnType<typeof useSession>)
  ;(fetch as jest.Mock).mockResolvedValue(response({ success: true, data: [{ ...row, userId: 'customer', healerId: 'healer', serviceId: 'service', healer: { user: { name: 'Healer' } }, meetingLink: 'https://meeting.example.test/private' }] }))
  const view = render(<MyBookingsPage />)
  expect(await screen.findByRole('link', { name: 'Join session' })).toHaveAttribute('href', 'https://meeting.example.test/private')
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'next-customer', role: 'USER' } }, status: 'authenticated' } as ReturnType<typeof useSession>)
  ;(fetch as jest.Mock).mockImplementation(() => new Promise(() => {}))
  view.rerender(<MyBookingsPage />)
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Join session' })).not.toBeInTheDocument())
})
