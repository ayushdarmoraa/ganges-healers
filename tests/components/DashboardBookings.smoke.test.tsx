import '@testing-library/jest-dom'
import React from 'react'
import { render, screen } from '@testing-library/react'
import MyBookingsPage from '@/app/dashboard/bookings/page'

jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'u1' } }, status: 'authenticated' }) }))

// Mock fetch for /api/bookings
const mockBookings = {
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
    {
      id: 'past-1', userId: 'u1', healerId: 'h2', serviceId: 's2',
      scheduledAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      status: 'COMPLETED',
      healer: { user: { name: 'Healer B' } },
      service: { name: 'Service B', slug: 'service-b' },
      payment: { amountPaise: 90000 },
    }
  ]
}

beforeAll(() => {
  global.fetch = (jest.fn(async (url: RequestInfo) => {
    if (typeof url === 'string' && url.includes('/api/bookings')) {
      return new Response(JSON.stringify(mockBookings), { status: 200 })
    }
    return new Response('{}', { status: 404 })
  }) as unknown) as typeof fetch
})

afterAll(() => {
  ;(global.fetch as unknown) = undefined
})

test('renders Upcoming and Past tabs and splits items', async () => {
  render(<MyBookingsPage />)
  expect(await screen.findByText(/Upcoming/)).toBeInTheDocument()
  expect(screen.getByText(/Past/)).toBeInTheDocument()

  // Upcoming contains the future item
  expect(await screen.findByText('Service A')).toBeInTheDocument()
  // Past tab content should include past item when selected
})
