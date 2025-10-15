/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from '@testing-library/react'

jest.mock('@/lib/programs/queries', () => ({
  getProgramBySlug: jest.fn(async () => ({
    id: 'p1', slug: 'foundation-6-week', title: 'Foundation 6 Week', shortDescription: 'short', longDescription: 'long', sessionsCount: 6, pricePaise: 29900, heroImageUrl: null, ratingAvg: null, serviceSlug: 'yoga-healing'
  }))
}))

import Page from '@/app/programs/[slug]/page'

describe('Program detail breadcrumbs', () => {
  test('renders Home › Programs › Foundation 6 Week; last not link', async () => {
    const el = await (Page as any)({ params: Promise.resolve({ slug: 'foundation-6-week' }) })
    const { container } = render(el)
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]')
    expect(nav).toBeTruthy()
    const links = Array.from(nav!.querySelectorAll('a')).map(a => a.textContent)
    expect(links).toEqual(['Home', 'Programs'])
    expect(nav!.textContent).toContain('Foundation 6 Week')
  })
})
