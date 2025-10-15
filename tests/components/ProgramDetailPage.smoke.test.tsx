/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react'

jest.mock('@/lib/programs/queries', () => ({
  getProgramBySlug: jest.fn(async (slug: string) => {
    if (slug !== 'p-yoga') return null
    return {
      id: 'p1', slug: 'p-yoga', title: 'Yoga Basics',
      shortDescription: 'Intro yoga', longDescription: 'Longer copy',
      sessionsCount: 8, pricePaise: 99900, heroImageUrl: null, ratingAvg: null
    }
  }),
}))

import ProgramDetailPage from '@/app/programs/[slug]/page'


describe('ProgramDetailPage (server component) smoke', () => {
  test('renders detail when program exists', async () => {
    const el = await (ProgramDetailPage as any)({ params: Promise.resolve({ slug: 'p-yoga' }) })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Yoga Basics' })).toBeInTheDocument()
    expect(screen.getByText(/Sessions:/)).toBeInTheDocument()
    expect(screen.getByText(/₹/)).toBeInTheDocument()
  })
})
