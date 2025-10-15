import React from 'react'
import { render, screen } from '@testing-library/react'
import Page from '@/app/store/[slug]/page'

jest.mock('@/lib/store/queries', () => ({
  getProductBySlug: jest.fn(async () => ({
    id: '1', slug: 'oil-1', title: 'Oil 1', shortDescription: 'Nice oil', longDescription: 'Long desc', pricePaise: 19900, imageUrl: null, ratingAvg: 4.7, stockStatus: 'IN_STOCK', category: { slug: 'oils', title: 'Oils' }
  }))
}))

describe('ProductDetailPage smoke', () => {
  test('renders title price and stock', async () => {
    const ui = (await Page({ params: Promise.resolve({ slug: 'oil-1' }) })) as unknown as React.ReactElement
    render(ui)

    expect(await screen.findByRole('heading', { level: 1, name: /Oil 1/i })).toBeInTheDocument()
    expect(screen.getByText(/₹/)).toBeInTheDocument()
    expect(screen.getByText(/In stock/i)).toBeInTheDocument()
  })
})
