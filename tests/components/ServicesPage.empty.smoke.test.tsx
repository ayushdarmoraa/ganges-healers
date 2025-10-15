import { render, screen } from '@testing-library/react'
import ServicesPage from '@/app/services/page'

jest.mock('@/lib/prisma', () => ({
  prisma: { service: { findMany: jest.fn(async () => []) } }
}))

jest.mock('@/components/services/ServicesFilter', () => {
  return function Mock() { return <div /> }
})

describe('ServicesPage empty state', () => {
  test('shows empty copy and clear filters when q present', async () => {
    const ui = (await ServicesPage({ searchParams: Promise.resolve({ q: 'foo' }) })) as unknown as React.ReactElement
    render(ui)
    expect(screen.getByText('No services yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clear filters/i })).toBeInTheDocument()
  })
})
