/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from '@testing-library/react'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: { findUnique: jest.fn(async ({ where }: any) => ({ id: 's1', name: 'Yoga Healing', slug: where.slug, description: 'desc', image: null, price: 499, duration: 60, category: 'Yoga', benefits: [], _count: { bookings: 0 } })) },
    healer: { findMany: jest.fn(async () => ([{ id: 'h1', bio: '', experienceYears: 5, rating: 4.8, specializations: ['Yoga'], user: { name: 'Healer One', image: '' } }])) },
  }
}))

// Avoid modal side-effects
jest.mock('@/components/booking/BookingModal', () => ({ __esModule: true, default: () => null }))

import ServiceDetailPage from '@/app/services/[slug]/page'

describe('Service detail breadcrumbs', () => {
  test('renders Home › Services › Yoga Healing with last not a link', async () => {
    const el = await (ServiceDetailPage as any)({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({}) })
    const { container } = render(el)
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]')
    expect(nav).toBeTruthy()
    const links = Array.from(nav!.querySelectorAll('a')).map(a => a.textContent)
    expect(links).toEqual(['Home', 'Services'])
    expect(nav!.textContent).toContain('Yoga Healing')
  })
})
