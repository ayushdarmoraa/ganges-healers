import React from 'react'
import { render, screen } from '@testing-library/react'

import Page from '@/app/programs/[slug]/page'

jest.mock('@/lib/programs/queries', () => ({
  getProgramBySlug: jest.fn(async () => ({
    id: 'p1', slug: 'abc', title: 'Test Program',
    shortDescription: 'short', longDescription: 'long',
    sessionsCount: 3, pricePaise: 9900,
    heroImageUrl: null, ratingAvg: null,
    serviceSlug: 'svc-1',
  }))
}))

// Component under test is an async server component; render its JSX

describe('Program detail page banner', () => {
  test('renders enroll coming soon CTA', async () => {
    // nextjs route params are a promise in this app
  const ui = (await Page({ params: Promise.resolve({ slug: 'abc' }) })) as unknown as React.ReactElement
  render(ui)

    expect(await screen.findByText(/Enroll \(coming soon\)/i)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /interested/i })).toBeInTheDocument()
  })
})
