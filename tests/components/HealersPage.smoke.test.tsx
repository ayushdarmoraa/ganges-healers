/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react'

jest.mock('@/lib/healers/queries', () => ({
  listHealers: jest.fn(async () => ({
    items: [
      { id: 'h1', slug: 'h1', name: 'Alice', title: 'Yoga Healer', yearsExperience: 5, ratingAvg: 4.8, avatarUrl: null, shortBio: 'Bio A', services: [{ slug: 'yoga-healing', title: 'Yoga Therapy' }] },
      { id: 'h2', slug: 'h2', name: 'Bob', title: 'Reiki Healer', yearsExperience: 3, ratingAvg: 4.5, avatarUrl: null, shortBio: 'Bio B', services: [{ slug: 'reiki-healing', title: 'Reiki Healing' }] },
    ],
    nextCursor: null,
  }))
}))

import HealersPage from '@/app/healers/page'

describe('HealersPage smoke', () => {
  test('renders healer cards with names and ratings', async () => {
    const el = await (HealersPage as any)({ searchParams: Promise.resolve({}) })
    render(el)
    expect(screen.getByText('Healers')).toBeInTheDocument()
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getAllByText(/⭐/).length).toBeGreaterThanOrEqual(2)
  })
})
