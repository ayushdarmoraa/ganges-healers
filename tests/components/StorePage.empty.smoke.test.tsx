import { render, screen } from '@testing-library/react'
import StorePage from '@/app/store/page'

jest.mock('@/lib/store/queries', () => ({
  listProducts: jest.fn(async () => ({ items: [], nextCursor: null }))
}))

describe('StorePage empty state', () => {
  test('shows empty copy and clear filters when filters present', async () => {
    const ui = (await StorePage({ searchParams: Promise.resolve({ q: 'a', categorySlug: 'c' }) })) as unknown as React.ReactElement
    render(ui)
    expect(screen.getByText('No products found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clear filters/i })).toBeInTheDocument()
  })
})
