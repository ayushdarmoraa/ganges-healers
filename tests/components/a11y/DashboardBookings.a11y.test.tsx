import '@testing-library/jest-dom'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MyBookingsPage from '@/app/dashboard/bookings/page'

jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }) }))

beforeAll(() => {
  const data = {
    success: true,
    data: [
      {
        id: 'future-1', userId: 'u1', healerId: 'h1', serviceId: 's1',
        scheduledAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        status: 'CONFIRMED',
        healer: { user: { name: 'Healer A' } },
        service: { name: 'Service A', slug: 'service-a' },
        payment: { amountPaise: 50000 },
      },
    ]
  }
  global.fetch = jest.fn(async (url: RequestInfo) => {
    if (typeof url === 'string' && url.includes('/api/bookings')) {
      return new Response(JSON.stringify(data), { status: 200 }) as unknown as Response
    }
    return new Response('{}', { status: 404 }) as unknown as Response
  }) as unknown as typeof fetch
})

afterAll(() => {
  ;(global.fetch as unknown) = undefined
})

test('reschedule and cancel dialogs have visible titles and dialog roles', async () => {
  render(<MyBookingsPage />)
  const rescheduleBtn = await screen.findByRole('button', { name: /Reschedule/i })
  fireEvent.click(rescheduleBtn)
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  const title = await screen.findByText(/Reschedule booking/i)
  expect(title.id).toBeTruthy()
  expect(dialog).toHaveAttribute('aria-labelledby', title.id)
})
