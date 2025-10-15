import { render, screen, within } from '@testing-library/react'
import { axe } from 'jest-axe'
import Breadcrumbs from '@/components/seo/Breadcrumbs'

describe('Breadcrumbs a11y', () => {
  it('has correct nav semantics and no axe violations', async () => {
    const crumbs = [
      { name: 'Home', href: '/' },
      { name: 'Services', href: '/services' },
      { name: 'Yoga Therapy', href: '/services/yoga-therapy' },
    ]
    const { container } = render(<Breadcrumbs crumbs={crumbs} />)
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    const items = within(nav).getAllByRole('listitem')
    expect(items.length).toBe(3)
    // Last has aria-current=page
    const last = items[2]
    expect(within(last).getByText('Yoga Therapy')).toHaveAttribute('aria-current', 'page')
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
