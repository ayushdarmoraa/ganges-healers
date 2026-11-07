import React from 'react'
import { render, screen } from '@testing-library/react'
import type { ProgramDetail } from '@/lib/programs/queries'

import Page from '@/app/programs/[slug]/page'

jest.mock('@/lib/programs/queries', () => ({
  getProgramBySlug: jest.fn(async (): Promise<ProgramDetail> => ({
    id: 'p1', slug: 'abc', title: 'Test Program',
    shortDescription: 'short', longDescription: 'long',
    sessionsCount: 3, sessionsPerWeek: 1, durationMinutes: 60, pricePaise: 9900,
    heroImageUrl: null, ratingAvg: null,
    serviceSlug: 'svc-1',
  }))
}))

// Component under test is an async server component; render its JSX

describe('Program detail page banner', () => {
  test('renders enroll CTA', async () => {
    // nextjs route params are a promise in this app
  const ui = (await Page({ params: Promise.resolve({ slug: 'abc' }) })) as unknown as React.ReactElement
  render(ui)

    // Both the sidebar title and enrollment widget show this copy.
    expect(screen.getAllByText(/Enroll in this program/i)).toHaveLength(2)
    expect(await screen.findByRole('button', { name: /enroll now/i })).toBeInTheDocument()
  })
})
