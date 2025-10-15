import { render, screen, within } from '@testing-library/react'
import HealersPage from '@/app/healers/page'

jest.mock('@/lib/healers/queries', () => ({
  listHealers: jest.fn(async () => ({ items: [], nextCursor: null }))
}))

describe('Healers list page breadcrumbs', () => {
  test('renders Home › Healers with last crumb as text', async () => {
    const ui = (await HealersPage({})) as unknown as React.ReactElement
    render(ui)
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(nav).getByText('Healers')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Healers' })).toBeNull()
  })
})
