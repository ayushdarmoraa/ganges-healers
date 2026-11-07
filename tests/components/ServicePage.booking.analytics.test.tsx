import { render } from '@testing-library/react'
import { StrictMode } from 'react'

import '../mocks/service-detail'

jest.mock('@/lib/analytics/client', () => ({
  track: jest.fn()
}))

// Mock BookingModal to avoid side-effects
jest.mock('@/components/booking/BookingModal', () => ({
  __esModule: true,
  default: () => null,
}))

import ServiceDetailPage from '@/app/services/[slug]/page'

const trackSpy = jest.requireMock<{ track: jest.Mock }>('@/lib/analytics/client').track

describe('Service page analytics (auto-open)', () => {
  beforeEach(() => trackSpy.mockClear())

  test('fires booking_modal_open once with expected payload', async () => {
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({ openBooking: '1', programSlug: 'foundation-6-week' }) })
    render(<StrictMode>{el}</StrictMode>)
    expect(trackSpy).toHaveBeenCalledTimes(1)
    const [event, props] = trackSpy.mock.calls[0]
    expect(event).toBe('booking_modal_open')
    expect(props.serviceSlug).toBe('yoga-healing')
    expect(props.programSlug).toBe('foundation-6-week')
    expect(props.productSlug).toBeUndefined()
    expect(props.source).toBe('query-openBooking')
    expect(typeof props.path).toBe('string')
    expect(typeof props.ts).toBe('number')
  })

  test('does not emit an auto-open event when the query flag is absent', async () => {
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({}) })
    render(el)
    expect(trackSpy).not.toHaveBeenCalled()
  })
})
