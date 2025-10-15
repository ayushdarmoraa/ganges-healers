/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from '@testing-library/react'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: { findUnique: jest.fn(async ({ where }: any) => ({ id: 's1', name: 'Yoga Healing', slug: where.slug, description: 'desc', image: null, price: 499, duration: 60, category: 'Yoga', benefits: [], _count: { bookings: 0 } })) },
    healer: { findMany: jest.fn(async () => ([{ id: 'h1', bio: '', experienceYears: 5, rating: 4.8, specializations: ['Yoga'], user: { name: 'Healer One', image: '' } }])) },
  }
}))

const trackSpy = jest.fn()
jest.mock('@/lib/analytics/client', () => ({
  track: (...args: any[]) => (trackSpy as any)(...args)
}))

// Mock BookingModal to avoid side-effects
jest.mock('@/components/booking/BookingModal', () => ({
  __esModule: true,
  default: () => null,
}))

import ServiceDetailPage from '@/app/services/[slug]/page'

describe('Service page analytics (auto-open)', () => {
  test('fires booking_modal_open once with expected payload', async () => {
    const el = await (ServiceDetailPage as any)({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ openBooking: '1', programSlug: 'foundation-6-week' }) })
    render(el)
    expect(trackSpy).toHaveBeenCalledTimes(1)
    const [event, props] = trackSpy.mock.calls[0]
    expect(event).toBe('booking_modal_open')
    expect(props.serviceSlug).toBe('yoga-healing')
    expect(props.programSlug).toBe('foundation-6-week')
  expect((props as any).productSlug).toBeUndefined()
    expect(props.source).toBe('query-openBooking')
    expect(typeof props.path).toBe('string')
    expect(typeof props.ts).toBe('number')
  })
})
