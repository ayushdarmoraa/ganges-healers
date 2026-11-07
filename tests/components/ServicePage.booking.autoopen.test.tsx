import { render, screen } from '@testing-library/react'

import '../mocks/service-detail'

// Mock BookingModal to observe usage
jest.mock('@/components/booking/BookingModal', () => ({
  __esModule: true,
  default: ({ isOpen, programSlug, healer }: { isOpen: boolean; programSlug?: string; healer: { id: string } }) => isOpen ? <div data-program-slug={programSlug} data-selected-healer={healer.id}>OPEN</div> : null,
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

  test('a profile booking opens the explicitly selected healer instead of the first result', async () => {
    const { prisma } = jest.requireMock<{ prisma: { healer: { findMany: jest.Mock } } }>('@/lib/prisma')
    const [first] = await prisma.healer.findMany()
    prisma.healer.findMany.mockResolvedValueOnce([first, { ...first, id: 'selected-healer', user: { name: 'Selected Practitioner', image: null } }])
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ openBooking: '1', healerId: 'selected-healer' }) })
    render(el)
    expect(screen.getByText('OPEN')).toHaveAttribute('data-selected-healer', 'selected-healer')
    expect(prisma.healer.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({ isActive: true }) }))
  })

  test.each(['unavailable-healer', '', ['h1', 'other']])('an invalid selected healer never falls back to a different practitioner (%j)', async healerId => {
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ openBooking: '1', healerId }) })
    render(el)
    expect(screen.queryByText('OPEN')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('The selected healer is unavailable for this service')
    expect(screen.getByRole('button', { name: 'Book Session' })).toBeVisible()
  })
})
