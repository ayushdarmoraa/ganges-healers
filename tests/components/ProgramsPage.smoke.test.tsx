/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react'

jest.mock('@/lib/programs/queries', () => ({
  listPrograms: jest.fn(async () => ({
    items: [
      { id: 'p1', slug: 'p-yoga', title: 'Yoga Basics', shortDescription: 'Intro yoga', sessionsCount: 8, pricePaise: 99900, heroImageUrl: null, ratingAvg: null },
      { id: 'p2', slug: 'p-medit', title: 'Meditation', shortDescription: 'Mindfulness', sessionsCount: 6, pricePaise: 49900, heroImageUrl: null, ratingAvg: null },
    ],
    nextCursor: null,
  })),
}))

import ProgramsPage from '@/app/programs/page'

// Server component returns a React element Promise; render that

describe('ProgramsPage (server component) smoke', () => {
  test('renders a grid of program cards with titles and prices', async () => {
    const el = await (ProgramsPage as any)()
    render(el)
    expect(screen.getByText('Programs')).toBeInTheDocument()
    expect(screen.getByText('Yoga Basics')).toBeInTheDocument()
    expect(screen.getByText('Meditation')).toBeInTheDocument()
    expect(screen.getAllByText(/₹/).length).toBeGreaterThanOrEqual(2)
  })
})
