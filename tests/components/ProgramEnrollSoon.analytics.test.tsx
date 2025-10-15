import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ProgramEnrollSoon from '@/components/features/programs/ProgramEnrollSoon'

jest.mock('@/lib/analytics/client', () => ({
  track: jest.fn(),
}))

const { track } = jest.requireMock('@/lib/analytics/client') as { track: jest.Mock }

describe('ProgramEnrollSoon analytics', () => {
  test('click fires program_enroll_click with expected payload', async () => {
    const user = userEvent.setup()
    // Use existing jsdom location and append a query for stability
  const originalHref = window.location.href
    window.history.pushState({}, '', '/programs/abc?ref=test')

    render(<ProgramEnrollSoon programSlug="abc" serviceSlug="svc-1" />)

    const btn = screen.getByRole('button', { name: /i\'m interested|i’m interested/i })
    await user.click(btn)

    expect(track).toHaveBeenCalledTimes(1)
    const [event, props] = track.mock.calls[0]
    expect(event).toBe('program_enroll_click')
    expect(props).toMatchObject({ programSlug: 'abc', serviceSlug: 'svc-1' })
    expect(typeof props.ts).toBe('number')
    expect(props.path).toBe('/programs/abc?ref=test')
  // restore
    window.history.replaceState({}, '', originalHref)
  })
})
