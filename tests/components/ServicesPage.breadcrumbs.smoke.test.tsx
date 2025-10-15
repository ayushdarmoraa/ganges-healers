import { render, screen } from '@testing-library/react'
import type React from 'react'
import ServicesPage from '@/app/services/page'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: {
      findMany: jest.fn(async () => [])
    }
  }
}))

jest.mock('@/components/services/ServicesFilter', () => {
  return function Mock() { return <div data-testid="services-filter" /> }
})


describe('Services list page breadcrumbs', () => {
  test('renders Home › Services with last crumb as text', async () => {
  const ui = (await ServicesPage({ searchParams: Promise.resolve({}) })) as unknown as React.ReactElement
  render(ui)
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/')
    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Services' })).toBeNull()
  })
})
