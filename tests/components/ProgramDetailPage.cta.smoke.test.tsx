import { render, screen } from '@testing-library/react'
import type { ProgramDetail } from '@/lib/programs/queries'

jest.mock('@/lib/programs/queries', () => ({
  getProgramBySlug: jest.fn(async (): Promise<ProgramDetail> => ({
    id: 'p1', slug: 'foundation-6-week', title: 'Foundation Program',
    shortDescription: 'Intro', longDescription: 'Long copy',
    sessionsCount: 6, sessionsPerWeek: 2, durationMinutes: 60,
    pricePaise: 29900, heroImageUrl: null, ratingAvg: null,
    serviceSlug: 'yoga-healing',
  })),
}))

import ProgramDetailPage from '@/app/programs/[slug]/page'

describe('Program Detail CTA', () => {
  test('renders CTA linking to service with openBooking and programSlug', async () => {
    const el = await ProgramDetailPage({ params: Promise.resolve({ slug: 'foundation-6-week' }) })
    render(el)
    const btn = await screen.findByRole('button', { name: /book an introductory session/i })
    const link = btn.closest('a')
    expect(link).toBeTruthy()
    expect(link).toHaveAttribute('href', '/services/yoga-healing?openBooking=1&programSlug=foundation-6-week')
  })
})
