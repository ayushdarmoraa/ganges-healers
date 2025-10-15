import React from 'react'
import { render } from '@testing-library/react'

jest.mock('@/lib/store/queries', () => ({
  getProductBySlug: jest.fn(async () => ({
    id: '1', slug: 'copper-bottle', title: 'Copper Bottle', shortDescription: 'Nice', longDescription: 'Long', pricePaise: 19900, imageUrl: null, ratingAvg: 4.5, stockStatus: 'IN_STOCK',
    category: { slug: 'wellness', title: 'Wellness' }, service: { slug: 'yoga-healing', title: 'Yoga Healing' }
  }))
}))

import Page from '@/app/store/[slug]/page'

describe('Product detail breadcrumbs', () => {
  test('renders Home › Store › Copper Bottle; last not link', async () => {
    const ui = (await Page({ params: Promise.resolve({ slug: 'copper-bottle' }) })) as unknown as React.ReactElement
    const { container } = render(ui)
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]')
    expect(nav).toBeTruthy()
    const links = Array.from(nav!.querySelectorAll('a')).map(a => a.textContent)
    expect(links).toEqual(['Home', 'Store'])
    expect(nav!.textContent).toContain('Copper Bottle')
  })
})
