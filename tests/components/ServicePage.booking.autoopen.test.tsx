import { render, screen } from '@testing-library/react'

import '../mocks/service-detail'

// Mock BookingModal to observe usage
jest.mock('@/components/booking/BookingModal', () => ({
  __esModule: true,
  default: ({ isOpen, programSlug }: { isOpen: boolean; programSlug?: string }) => isOpen ? <div data-program-slug={programSlug}>OPEN</div> : null,
}))

import ServiceDetailPage from '@/app/services/[slug]/page'

describe('Service page booking auto-open', () => {
  test.each([{ openBooking: '1' }, { openBooking: ['1'] }])('auto-opens and forwards the program context for %j', async ({ openBooking }) => {
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ openBooking, programSlug: 'foundation-6-week' }) })
    render(el)
    expect(screen.getByText('OPEN')).toHaveAttribute('data-program-slug', 'foundation-6-week')
  })

  test('does not auto-open when openBooking param is absent', async () => {
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({}) })
    render(el)
    expect(screen.queryByText('OPEN')).toBeNull()
  })

  test('does not auto-open without an available healer', async () => {
    jest.requireMock<{ prisma: { healer: { findMany: jest.Mock } } }>('@/lib/prisma')
      .prisma.healer.findMany.mockResolvedValueOnce([])
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ openBooking: '1' }) })
    render(el)
    expect(screen.queryByText('OPEN')).toBeNull()
    expect(screen.getByText('No healers published for this service yet.')).toBeInTheDocument()
  })
})
