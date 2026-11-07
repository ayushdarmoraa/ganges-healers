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
    expect(screen.getByText('No matching services')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /clear filters/i })).toBeInTheDocument()
  })

  test.each([{ category: 'unavailable' }, { search: 'unknown' }, { minPrice: '5000' }, { maxPrice: '0' }])('can recover from every empty filter combination (%j)', async params => {
    render(await ServicesPage({ searchParams: Promise.resolve(params) }))
    expect(screen.getByRole('link', { name: /clear filters/i })).toHaveAttribute('href', '/services')
    expect(screen.getByText('No matching services')).toBeVisible()
  })

  test('an empty catalog without filters keeps its original empty state', async () => {
    render(await ServicesPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('No services yet')).toBeVisible()
    expect(screen.queryByRole('link', { name: /clear filters/i })).toBeNull()
  })
})
