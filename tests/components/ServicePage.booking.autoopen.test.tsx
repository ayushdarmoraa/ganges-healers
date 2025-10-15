/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react'

// Mock prisma for Service and Healers lookup
jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: {
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.slug !== 'yoga-healing') return null
        return { id: 's1', name: 'Yoga Healing', slug: 'yoga-healing', description: 'desc', image: null, price: 499, duration: 60, category: 'Yoga', benefits: [], _count: { bookings: 0 } }
      }),
    },
    healer: {
      findMany: jest.fn(async () => [
        { id: 'h1', bio: '', experienceYears: 5, rating: 4.8, specializations: ['Yoga'], user: { name: 'Healer One', image: '' } },
      ]),
    },
  }
}))

// Mock BookingModal to observe usage
jest.mock('@/components/booking/BookingModal', () => ({
  __esModule: true,
  default: ({ isOpen }: any) => isOpen ? <div>OPEN</div> : null,
}))

import ServiceDetailPage from '@/app/services/[slug]/page'

describe('Service page booking auto-open', () => {
  test('auto-opens BookingModal when openBooking=1 is present', async () => {
    const el = await (ServiceDetailPage as any)({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ openBooking: '1', programSlug: 'foundation-6-week' }) })
  render(el)
  expect(screen.getByText('OPEN')).toBeInTheDocument()
  })

  test('does not auto-open when openBooking param is absent', async () => {
    const el = await (ServiceDetailPage as any)({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({}) })
  render(el)
  expect(screen.queryByText('OPEN')).toBeNull()
  })
})
