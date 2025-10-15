import React from 'react'
import { render, screen } from '@testing-library/react'
import Page from '@/app/store/page'

jest.mock('@/lib/store/queries', () => ({
  listProducts: jest.fn(async () => ({
    items: [
      { id: '1', slug: 'oil-1', title: 'Oil 1', shortDescription: 'Nice oil', pricePaise: 19900, imageUrl: null, ratingAvg: 4.7, stockStatus: 'IN_STOCK', category: { slug: 'oils', title: 'Oils' } },
      { id: '2', slug: 'crystal-1', title: 'Crystal 1', shortDescription: 'Nice crystal', pricePaise: 29900, imageUrl: null, ratingAvg: null, stockStatus: 'LOW', category: { slug: 'crystals', title: 'Crystals' } },
    ],
    nextCursor: null
  }))
}))

describe('StorePage smoke', () => {
  test('renders product cards', async () => {
    const ui = (await Page({ searchParams: Promise.resolve({}) })) as unknown as React.ReactElement
    render(ui)
    expect(await screen.findByText(/Store/i)).toBeInTheDocument()
    expect(screen.getByText(/Oil 1/i)).toBeInTheDocument()
    expect(screen.getByText(/Crystal 1/i)).toBeInTheDocument()
  })
})
