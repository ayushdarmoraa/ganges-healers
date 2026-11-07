import { render } from '@testing-library/react'

import '../mocks/service-detail'

// Avoid modal side-effects
jest.mock('@/components/booking/BookingModal', () => ({ __esModule: true, default: () => null }))

import ServiceDetailPage from '@/app/services/[slug]/page'

describe('Service detail breadcrumbs', () => {
  test('renders Home › Services › Yoga Healing with last not a link', async () => {
    const el = await ServiceDetailPage({ params: Promise.resolve({ slug: 'yoga-healing' }), searchParams: Promise.resolve({}) })
    const { container } = render(el)
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]')
    expect(nav).toBeTruthy()
    const links = Array.from(nav!.querySelectorAll('a')).map(a => a.textContent)
    expect(links).toEqual(['Home', 'Services'])
    expect(nav!.textContent).toContain('Yoga Healing')
  })
})
