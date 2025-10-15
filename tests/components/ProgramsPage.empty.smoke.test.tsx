import { render, screen } from '@testing-library/react'
import ProgramsPage from '@/app/programs/page'

jest.mock('@/lib/programs/queries', () => ({
  listPrograms: jest.fn(async () => ({ items: [] }))
}))

describe('ProgramsPage empty state', () => {
  test('shows empty copy and clear filters when q present', async () => {
    const ui = (await ProgramsPage({ searchParams: Promise.resolve({ q: 'foo' }) })) as unknown as React.ReactElement
    render(ui)
    expect(screen.getByText('No programs found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clear filters/i })).toBeInTheDocument()
  })
})
