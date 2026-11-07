import '../mocks/product-page-context'
import type { ProductDetail } from '@/lib/store/queries'
import React from 'react'
import { render } from '@testing-library/react'

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

import Page from '@/app/store/[slug]/page'

describe('Product detail breadcrumbs', () => {
  test('renders Home › Store › Copper Bottle; last not link', async () => {
    const ui = (await Page({ params: Promise.resolve({ slug: 'copper-bottle' }), searchParams: Promise.resolve({}) })) as unknown as React.ReactElement
    const { container } = render(ui)
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]')
    expect(nav).toBeTruthy()
    const links = Array.from(nav!.querySelectorAll('a')).map(a => a.textContent)
    expect(links).toEqual(['Home', 'Store'])
    expect(nav!.textContent).toContain('Copper Bottle')
  })
})
