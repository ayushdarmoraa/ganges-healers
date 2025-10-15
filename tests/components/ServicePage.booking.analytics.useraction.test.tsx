/* eslint-disable @typescript-eslint/no-explicit-any */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const trackSpy = jest.fn()
jest.mock('@/lib/analytics/client', () => ({
  track: (...args: any[]) => (trackSpy as any)(...args)
}))

// Mock BookingModal minimal
jest.mock('@/components/booking/BookingModal', () => ({
  __esModule: true,
  default: ({ isOpen }: any) => isOpen ? <div>OPEN</div> : null,
}))

import HealerBookAction from '@/components/features/services/HealerBookAction'

describe('Service page analytics (user action)', () => {
  test('fires booking_modal_open on Book click with source:user-action', async () => {
    const user = userEvent.setup()
    render(<HealerBookAction healer={{ id: 'h1', name: 'Healer One' }} serviceId="s1" serviceName="Yoga Healing" />)
    await user.click(screen.getByRole('button', { name: /book/i }))
    expect(trackSpy).toHaveBeenCalledTimes(1)
    const [event, props] = trackSpy.mock.calls[0]
    expect(event).toBe('booking_modal_open')
    expect(props.source).toBe('user-action')
    expect(props.programSlug).toBeUndefined()
  // ensure contract unchanged: no productSlug in booking_modal_open
  expect((props as any).productSlug).toBeUndefined()
    expect(typeof props.serviceSlug).toBe('string')
    expect(typeof props.path).toBe('string')
    expect(typeof props.ts).toBe('number')
  })
})
