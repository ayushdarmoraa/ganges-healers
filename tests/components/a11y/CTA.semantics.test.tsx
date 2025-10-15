import { render, screen } from '@testing-library/react'
import ProgramEnrollSoon from '@/components/features/programs/ProgramEnrollSoon'
import ProductCtaAnalytics from '@/app/store/[slug]/product-cta-analytics'

jest.mock('@/lib/analytics/client', () => ({ track: jest.fn() }))

describe('CTA semantics', () => {
  it('ProgramEnrollSoon uses a button for in-place action', () => {
    render(<ProgramEnrollSoon programSlug="p1" serviceSlug="svc1" />)
    const btn = screen.getByRole('button', { name: /i['’]m interested/i })
    expect(btn).toHaveAttribute('type', 'button')
  })

  it('Product CTA uses anchor for navigation', () => {
    render(
      <ProductCtaAnalytics productSlug="prod" serviceSlug="svc" href="/services/svc">
        View service
      </ProductCtaAnalytics>
    )
    const link = screen.getByRole('link', { name: /view service/i })
    expect(link).toHaveAttribute('href', '/services/svc')
  })
})
