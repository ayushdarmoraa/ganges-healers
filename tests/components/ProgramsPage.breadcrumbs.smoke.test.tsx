import { render, screen, within } from '@testing-library/react'
import ProgramsPage from '@/app/programs/page'

jest.mock('@/lib/programs/queries', () => ({
  listPrograms: jest.fn(async () => ({ items: [] }))
}))

describe('Programs list page breadcrumbs', () => {
  test('renders Home › Programs with last crumb as text', async () => {
    const ui = (await ProgramsPage({ searchParams: Promise.resolve({}) })) as unknown as React.ReactElement
    render(ui)
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(within(nav).getByText('Programs')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Programs' })).toBeNull()
  })
})
