import { render, screen } from '@testing-library/react'

import '../mocks/service-detail'

// Mock BookingModal to assert props
jest.mock('@/components/booking/BookingModal', () => ({
  __esModule: true,
  default: ({ isOpen, productSlug }: { isOpen: boolean; productSlug?: string }) => isOpen ? <div>OPEN: {productSlug}</div> : null,
}))

import ServiceDetailPage from '@/app/services/[slug]/page'

describe('Service page booking auto-open with productSlug', () => {
  test('auto-opens and passes productSlug in props', async () => {
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ openBooking: '1', productSlug: 'copper-bottle' }) })
    render(el)
    expect(screen.getByText(/OPEN:/)).toHaveTextContent('copper-bottle')
  })

  test('no auto-open without openBooking', async () => {
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ productSlug: 'copper-bottle' }) })
    render(el)
    expect(screen.queryByText(/OPEN:/)).toBeNull()
  })
})
