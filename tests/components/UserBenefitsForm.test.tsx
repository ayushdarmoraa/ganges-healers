import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { UserBenefitsForm } from '@/components/admin/user-benefits-form'
jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const session = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react').useSession
const onSave = jest.fn()
const props = { actorId: 'admin', label: 'Customer', user: { id: 'customer', vip: false, freeSessionCredits: 2, version: 'a'.repeat(64) }, onSave }
beforeEach(() => { jest.clearAllMocks(); session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'admin', role: 'ADMIN' } } }); onSave.mockResolvedValue({ success: true, changed: true, user: { ...props.user, vip: true, freeSessionCredits: 4, version: 'b'.repeat(64) } }) })
function edit() { fireEvent.change(screen.getByLabelText('Manual VIP'), { target: { value: 'true' } }); fireEvent.change(screen.getByLabelText('Free credits'), { target: { value: '4' } }); fireEvent.change(screen.getByLabelText('Reason for change'), { target: { value: 'Service recovery' } }) }
test('unchanged benefits and changes without a reason cannot submit', () => {
  render(<UserBenefitsForm {...props} />)
  expect(screen.getByRole('button', { name: 'Save benefits' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Free credits'), { target: { value: '4' } })
  expect(screen.getByRole('button', { name: 'Save benefits' })).toBeDisabled(); expect(onSave).not.toHaveBeenCalled()
})
test.each(['', '-1', '1.5', '2147483648'])('invalid balance %s cannot submit even through a form event', value => {
  render(<UserBenefitsForm {...props} />); edit()
  fireEvent.change(screen.getByLabelText('Free credits'), { target: { value } })
  fireEvent.submit(screen.getByRole('form', { name: 'Benefits for Customer' }))
  expect(onSave).not.toHaveBeenCalled()
})
test('an explicit save sends the reviewed identity/version and shows confirmed values', async () => {
  render(<UserBenefitsForm {...props} />); edit()
  fireEvent.click(screen.getByRole('button', { name: 'Save benefits' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Benefits saved.')
  expect(onSave).toHaveBeenCalledWith({ userId: 'customer', version: 'a'.repeat(64), vip: true, freeSessionCredits: 4, reason: 'Service recovery' })
  expect(screen.getByLabelText('Reason for change')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Save benefits' })).toBeDisabled()
})
test('stale balances keep the draft and require reviewing a fresh user list', async () => {
  onSave.mockResolvedValue({ success: false, error: 'Balance changed. Review the current values.', code: 'USER_BENEFITS_CHANGED' })
  render(<UserBenefitsForm {...props} />); edit(); fireEvent.click(screen.getByRole('button', { name: 'Save benefits' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Balance changed')
  expect(screen.getByLabelText('Free credits')).toHaveValue(4); expect(screen.getByLabelText('Reason for change')).toHaveValue('Service recovery')
  expect(screen.getByRole('link', { name: 'Reload user list' })).toHaveAttribute('href', '/admin')
  expect(screen.getByRole('button', { name: 'Save benefits' })).toBeDisabled()
})
test('transport failures retain edits and do not expose private errors', async () => {
  onSave.mockRejectedValue(new Error('private database details'))
  render(<UserBenefitsForm {...props} />); edit(); fireEvent.click(screen.getByRole('button', { name: 'Save benefits' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your changes are still here')
  expect(document.body).not.toHaveTextContent('private database details'); expect(screen.getByLabelText('Free credits')).toHaveValue(4)
  expect(screen.getByRole('button', { name: 'Save benefits' })).toBeEnabled()
})
test('pending saves cannot duplicate and disable every draft field', async () => {
  let finish!: (result: unknown) => void; onSave.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<UserBenefitsForm {...props} />); edit()
  const form = screen.getByRole('form', { name: 'Benefits for Customer' }); fireEvent.submit(form); fireEvent.submit(form)
  expect(onSave).toHaveBeenCalledTimes(1); expect(form).toHaveAttribute('aria-busy', 'true'); expect(screen.getByLabelText('Free credits')).toBeDisabled()
  await act(async () => finish({ success: true, changed: true, user: props.user }))
})
test('another account cannot receive the draft or a late save result', async () => {
  let finish!: (result: unknown) => void; onSave.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { rerender } = render(<UserBenefitsForm {...props} />); edit(); fireEvent.click(screen.getByRole('button', { name: 'Save benefits' }))
  session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'another-admin', role: 'ADMIN' } } }); rerender(<UserBenefitsForm {...props} />)
  expect(screen.queryByRole('form')).not.toBeInTheDocument()
  await act(async () => finish({ success: true, changed: true, user: props.user }))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
test('loading, signed-out and non-administrator sessions cannot edit', () => {
  const { rerender } = render(<UserBenefitsForm {...props} />)
  for (const state of [{ status: 'loading', data: null }, { status: 'unauthenticated', data: null }, { status: 'authenticated', data: { user: { id: 'admin', role: 'USER' } } }]) { session.mockReturnValue(state); rerender(<UserBenefitsForm {...props} />); expect(screen.queryByRole('form')).not.toBeInTheDocument() }
})
