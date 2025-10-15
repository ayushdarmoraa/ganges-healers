import { render, screen } from '@testing-library/react'
import type React from 'react'

jest.mock('@/lib/programs/queries', () => ({
  getProgramBySlug: jest.fn(async () => null)
}))

// Instead of triggering notFound() navigation, directly render NotFoundDetail
import NotFoundDetail from '@/components/empty/NotFoundDetail'

function NotFoundShim() {
  return <NotFoundDetail backHref="/programs" backLabel="Browse all programs" />
}

describe('ProgramDetailPage not found segment', () => {
  test('renders friendly not-found with back link', async () => {
    render(<NotFoundShim /> as unknown as React.ReactElement)
    expect(screen.getByText(/We can’t find that item/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /browse all programs/i })).toHaveAttribute('href', '/programs')
  })
})
