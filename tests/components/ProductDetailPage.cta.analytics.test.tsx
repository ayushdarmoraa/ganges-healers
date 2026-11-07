import '../mocks/product-page-context'
import type { ProductDetail } from '@/lib/store/queries'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Page from '@/app/store/[slug]/page'

jest.mock('@/components/store/AddToCartButton', () => ({
  __esModule: true,
  default: () => <div data-testid="add-to-cart" />,
}))

jest.mock('@/lib/store/queries', () => ({
  getProductBySlug: jest.fn(async (): Promise<ProductDetail> => ({
    id: '1', slug: 'copper-bottle', title: 'Copper Bottle', shortDescription: 'Nice', longDescription: 'Long', pricePaise: 19900, imageUrl: null, ratingAvg: 4.5, stockStatus: 'IN_STOCK', stockCount: null, isConsecrated: false, chakra: null,
    category: { slug: 'wellness', title: 'Wellness' }, service: { slug: 'yoga-healing', title: 'Yoga Healing' }
  }))
}))

jest.mock('@/lib/analytics/client', () => ({
  track: jest.fn()
}))

const trackSpy = jest.requireMock<{ track: jest.Mock }>('@/lib/analytics/client').track

describe('ProductDetailPage CTA analytics', () => {
  test('fires product_service_cta_click with correct props', async () => {
    const user = userEvent.setup()
    const ui = (await Page({ params: Promise.resolve({ slug: 'copper-bottle' }), searchParams: Promise.resolve({}) })) as unknown as React.ReactElement
    render(ui)

    const link = await screen.findByRole('link', { name: /Book a session for this product/i })
    // Exercise the real analytics click handler; jsdom cannot perform navigation.
    // The CTA contract test separately checks this link's exact destination.
    link.addEventListener('click', event => event.preventDefault(), { once: true })
    await user.click(link)

    expect(trackSpy).toHaveBeenCalledTimes(1)
    const [event, props] = trackSpy.mock.calls[0]
    expect(event).toBe('product_service_cta_click')
    expect(props.productSlug).toBe('copper-bottle')
    expect(props.serviceSlug).toBe('yoga-healing')
    expect(typeof props.path).toBe('string')
    expect(typeof props.ts).toBe('number')
  })
})
