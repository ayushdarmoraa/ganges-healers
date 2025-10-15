import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingModal from '@/components/booking/BookingModal'

// Mock next-auth to be authenticated for booking flow
jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1', email: 'a@b.com' } }, status: 'authenticated' })
}))

describe('BookingModal focus', () => {
  it('focuses the date input on open', async () => {
    render(
      <BookingModal
        isOpen
        onClose={() => {}}
        healer={{ id: 'h1', user: { name: 'Healer' }, experienceYears: 5, rating: 4.8 }}
        serviceId="s1"
        serviceName="Yoga"
      />
    )
    const dateInput = await screen.findByLabelText(/select date/i, { selector: 'input' }).catch(() => null)
    // If label is not associated, fall back to role and type
    const input = dateInput ?? screen.getByRole('textbox', { hidden: true })
    expect(input).toHaveFocus()
  })

  it('closes on Cancel', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(
      <BookingModal
        isOpen
        onClose={onClose}
        healer={{ id: 'h1', user: { name: 'Healer' }, experienceYears: 5, rating: 4.8 }}
        serviceId="s1"
        serviceName="Yoga"
      />
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
  })
})
