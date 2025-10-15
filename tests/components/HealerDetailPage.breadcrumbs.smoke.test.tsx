/* eslint-disable @typescript-eslint/no-explicit-any */
import { render } from '@testing-library/react'

jest.mock('@/lib/healers/queries', () => ({
  getHealerBySlug: jest.fn(async () => ({
    id: 'h1', slug: 'anita-sharma', name: 'Anita Sharma', title: 'Yoga Healer', yearsExperience: 5, ratingAvg: 4.8, avatarUrl: null, shortBio: 'short', services: [{ slug: 'yoga-healing', title: 'Yoga Therapy' }], longBio: 'Long bio', certifications: ['RYT-200'], languages: ['English'], gallery: []
  }))
}))

import Page from '@/app/healers/[slug]/page'

describe('Healer detail breadcrumbs', () => {
  test('renders Home › Healers › Anita Sharma; last not link', async () => {
    const el = await (Page as any)({ params: Promise.resolve({ slug: 'anita-sharma' }) })
    const { container } = render(el)
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]')
    expect(nav).toBeTruthy()
    const links = Array.from(nav!.querySelectorAll('a')).map(a => a.textContent)
    expect(links).toEqual(['Home', 'Healers'])
    expect(nav!.textContent).toContain('Anita Sharma')
  })
})
