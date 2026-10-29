import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RescheduleModal from '@/components/bookings/RescheduleModal'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'
import type { NormalizedBooking } from '@/app/dashboard/bookings/page'

jest.mock('@/lib/analytics/client', () => ({ track: jest.fn() }))

const booking: NormalizedBooking = {
  id: 'booking-1', healerId: 'healer-1', serviceId: 'service-1', serviceSlug: 'reiki',
  serviceName: 'Reiki', healerName: 'Healer', startIso: new Date(Date.now() + 5 * 86400000).toISOString(),
  status: 'CONFIRMED', isCancelable: true, isReschedulable: true, amountPaise: 5000,
}
let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })

test('loads owned availability and submits the chosen India-time instant', async () => {
  const user = userEvent.setup()
  const date = clinicDate(new Date(Date.now() + 8 * 86400000))
  const expected = clinicSlotInstant(date, '10:00').toISOString()
  const onSuccess = jest.fn()
  const onOpenChange = jest.fn()
  const fetchMock = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url).startsWith('/api/availability?')) {
      return new Response(JSON.stringify({ data: { slots: [
        { time: '10:00', available: true }, { time: '10:30', available: false },
      ] } }), { status: 200 })
    }
    if (String(url) === '/api/bookings/booking-1' && init?.method === 'PUT') {
      return new Response(JSON.stringify({ data: { scheduledAt: expected } }), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  })
  global.fetch = fetchMock as typeof fetch
  render(<RescheduleModal open onOpenChange={onOpenChange} booking={booking} onSuccess={onSuccess} />)
  await user.type(screen.getByLabelText('Select date'), date)
  const slot = await screen.findByRole('button', { name: '10:00 AM' })
  expect(screen.queryByRole('button', { name: '10:30 AM' })).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledWith('/api/availability?healerId=healer-1&date=' + date + '&bookingId=booking-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  await user.click(slot)
  await user.click(screen.getByRole('button', { name: 'Confirm' }))
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ startIso: expected, status: 'RESCHEDULED' })))
  expect(fetchMock).toHaveBeenCalledWith('/api/bookings/booking-1', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ scheduledAt: expected }) }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test('shows an availability error and does not offer invented times', async () => {
  const user = userEvent.setup()
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ error: 'Booking not found' }), { status: 404 })) as typeof fetch
  render(<RescheduleModal open onOpenChange={jest.fn()} booking={booking} onSuccess={jest.fn()} />)
  await user.type(screen.getByLabelText('Select date'), clinicDate(new Date(Date.now() + 8 * 86400000)))
  expect(await screen.findByText('Booking not found')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
})
