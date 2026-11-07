import '../mocks/product-page-context'
import type { ProductDetail } from '@/lib/store/queries'
import React from 'react'
import { render, screen } from '@testing-library/react'
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

describe('ProductDetailPage CTA link', () => {
  test('renders CTA linking to Service with openBooking=1&productSlug', async () => {
    const ui = (await Page({ params: Promise.resolve({ slug: 'copper-bottle' }), searchParams: Promise.resolve({}) })) as unknown as React.ReactElement
    render(ui)
    const link = await screen.findByRole('link', { name: /Book a session for this product/i })
    expect(link).toHaveAttribute('href', '/services/yoga-healing?openBooking=1&productSlug=copper-bottle')
  })
})
