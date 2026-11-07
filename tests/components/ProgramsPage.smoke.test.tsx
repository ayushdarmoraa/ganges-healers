import { render, screen } from '@testing-library/react'
import type { ProgramListItem } from '@/lib/programs/queries'

jest.mock('@/lib/programs/queries', () => ({
  listPrograms: jest.fn(async (): Promise<{ items: ProgramListItem[]; nextCursor: null }> => ({
    items: [
      { id: 'p1', slug: 'p-yoga', title: 'Yoga Basics', shortDescription: 'Intro yoga', sessionsCount: 8, sessionsPerWeek: 2, durationMinutes: 60, pricePaise: 99900, heroImageUrl: null, ratingAvg: null },
      { id: 'p2', slug: 'p-medit', title: 'Meditation', shortDescription: 'Mindfulness', sessionsCount: 6, sessionsPerWeek: 3, durationMinutes: 30, pricePaise: 49900, heroImageUrl: null, ratingAvg: null },
    ],
    nextCursor: null,
  })),
}))

import ProgramsPage from '@/app/programs/page'

// Server component returns a React element Promise; render that

describe('ProgramsPage (server component) smoke', () => {
  test('renders a grid of program cards with titles and prices', async () => {
    const el = await ProgramsPage({})
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Transformational Healing Programs' })).toBeInTheDocument()
    expect(screen.getByText('Yoga Basics')).toBeInTheDocument()
    expect(screen.getByText('Meditation')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Yoga Basics/ })).toHaveAttribute('href', '/programs/p-yoga')
    expect(screen.getByRole('link', { name: /Meditation/ })).toHaveAttribute('href', '/programs/p-medit')
    expect(screen.getByText('₹999')).toBeInTheDocument()
    expect(screen.getByText('₹499')).toBeInTheDocument()
  })
})
