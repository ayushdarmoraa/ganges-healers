import { render, screen, within } from '@testing-library/react'
import StorePage from '@/app/store/page'

jest.mock('@/lib/store/queries', () => ({
  listProducts: jest.fn(async () => ({ items: [], nextCursor: null }))
}))

describe('Store list page breadcrumbs', () => {
  test('renders Home › Store with last crumb as text', async () => {
    const ui = (await StorePage({})) as unknown as React.ReactElement
    render(ui)
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(nav).getByText('Store')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Store' })).toBeNull()
  })
})
