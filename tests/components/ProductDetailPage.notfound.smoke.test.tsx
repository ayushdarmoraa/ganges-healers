import { render, screen } from '@testing-library/react'

import NotFoundDetail from '@/components/empty/NotFoundDetail'

function NotFoundShim() {
  return <NotFoundDetail backHref="/store" backLabel="Browse all products" />
}

describe('ProductDetailPage not found segment', () => {
  test('renders friendly not-found with back link', async () => {
    render(<NotFoundShim />)
    expect(screen.getByText(/We can’t find that item/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse all products/i })).toHaveAttribute('href', '/store')
  })
})
