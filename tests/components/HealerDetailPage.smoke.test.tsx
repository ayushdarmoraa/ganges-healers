/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react'

jest.mock('@/lib/healers/queries', () => ({
  getHealerBySlug: jest.fn(async () => ({
    id: 'h1', slug: 'h1', name: 'Alice', title: 'Yoga Healer', yearsExperience: 5, ratingAvg: 4.8, avatarUrl: null, shortBio: 'short', services: [{ slug: 'yoga-healing', title: 'Yoga Therapy' }], longBio: 'Long bio', certifications: ['RYT-200'], languages: ['English'], gallery: []
  }))
}))

import HealerDetailPage from '@/app/healers/[slug]/page'

describe('HealerDetailPage smoke', () => {
  test('renders profile header and sections', async () => {
    const el = await (HealerDetailPage as any)({ params: Promise.resolve({ slug: 'h1' }) })
    render(el)
    expect(screen.getByRole('heading', { level: 1, name: 'Alice' })).toBeInTheDocument()
    expect(screen.getByText(/Yoga Healer/)).toBeInTheDocument()
    expect(screen.getByText('About')).toBeInTheDocument()
    expect(screen.getByText('Certifications')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /book a session/i })).toHaveAttribute('href', expect.stringContaining('/services/yoga-healing?openBooking=1'))
  })
})
