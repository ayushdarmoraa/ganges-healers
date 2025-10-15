import { render, screen } from '@testing-library/react'
import HealersPage from '@/app/healers/page'

jest.mock('@/lib/healers/queries', () => ({
  listHealers: jest.fn(async () => ({ items: [], nextCursor: null }))
}))

describe('HealersPage empty state', () => {
  test('shows empty copy and clear filters when filters present', async () => {
    const ui = (await HealersPage({ searchParams: Promise.resolve({ q: 'a', serviceSlug: 'x' }) })) as unknown as React.ReactElement
    render(ui)
    expect(screen.getByText('No healers found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clear filters/i })).toBeInTheDocument()
  })
})
