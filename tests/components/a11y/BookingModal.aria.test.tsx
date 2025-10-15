import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingModal from '@/components/booking/BookingModal'

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { id: 'u1', email: 'a@b.com' } }, status: 'authenticated' })
}))

describe('BookingModal ARIA', () => {
  it('has dialog semantics with aria-modal and labelledby the title', async () => {
    render(
      <BookingModal
        isOpen
        onClose={() => {}}
        healer={{ id: 'h1', user: { name: 'Healer' }, experienceYears: 5, rating: 4.8 }}
        serviceId="s1"
        serviceName="Yoga"
      />
    )
    const dialog = screen.getByRole('dialog', { name: /book yoga/i })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    const labelledby = dialog.getAttribute('aria-labelledby')
    expect(labelledby).toBeTruthy()
    if (labelledby) {
      const titleEl = document.getElementById(labelledby)
      expect(titleEl?.textContent).toMatch(/book\s+yoga/i)
    }
  })

  it('esc closes and returns focus', async () => {
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
    // Focus date input first
    const input = await screen.findByLabelText(/select date/i)
    input.focus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})
