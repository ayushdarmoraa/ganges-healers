import { render, screen, within } from '@testing-library/react'
import type { ProgramDetail } from '@/lib/programs/queries'

jest.mock('@/lib/programs/queries', () => ({
  getProgramBySlug: jest.fn(async (slug: string): Promise<ProgramDetail | null> => {
    if (slug !== 'p-yoga') return null
    return {
      id: 'p1', slug: 'p-yoga', title: 'Yoga Basics',
      shortDescription: 'Intro yoga', longDescription: 'Longer copy',
      sessionsCount: 8, sessionsPerWeek: 2, durationMinutes: 60,
      pricePaise: 99900, heroImageUrl: null, ratingAvg: null
    }
  }),
}))

import ProgramDetailPage from '@/app/programs/[slug]/page'


describe('ProgramDetailPage (server component) smoke', () => {
  test('renders detail when program exists', async () => {
    const el = await ProgramDetailPage({ params: Promise.resolve({ slug: 'p-yoga' }) })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Yoga Basics' })).toBeInTheDocument()
    for (const [label, value] of [['Total Sessions', '8'], ['Per Week', '2'], ['Min / Session', '60'], ['Weeks Total', '4']]) {
      const metric = screen.getByText(label).parentElement!
      expect(within(metric).getByText(value)).toBeInTheDocument()
    }
    expect(screen.getAllByText('₹999')).toHaveLength(2)
  })
})
