/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react'

jest.mock('@/lib/programs/queries', () => ({
  getProgramBySlug: jest.fn(async () => ({
    id: 'p1', slug: 'foundation-6-week', title: 'Foundation Program',
    shortDescription: 'Intro', longDescription: 'Long copy',
    sessionsCount: 6, pricePaise: 29900, heroImageUrl: null, ratingAvg: null,
    serviceSlug: 'yoga-healing',
  })),
}))

import ProgramDetailPage from '@/app/programs/[slug]/page'

describe('Program Detail CTA', () => {
  test('renders CTA linking to service with openBooking and programSlug', async () => {
    const el = await (ProgramDetailPage as any)({ params: Promise.resolve({ slug: 'foundation-6-week' }) })
    render(el)
    const btn = await screen.findByRole('button', { name: /book a session/i })
    const link = btn.closest('a')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toContain('/services/yoga-healing')
    expect(link?.getAttribute('href')).toContain('openBooking=1')
    expect(link?.getAttribute('href')).toContain('programSlug=foundation-6-week')
  })
})
