import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DeleteProductForm } from '@/components/admin/delete-product-form'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const auth = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react')
const action = jest.fn()
const props = { id: 'product', title: 'Practice beads', ownerId: 'admin', version: 'a'.repeat(64), protectedHistory: false, action }
beforeEach(() => { jest.clearAllMocks(); auth.useSession.mockReturnValue({ status: 'authenticated', data: { user: { id: 'admin', role: 'ADMIN' } } }); action.mockResolvedValue({ success: true }) })

test('protected products explain deactivation and cannot open a delete confirmation', () => {
  render(<DeleteProductForm {...props} protectedHistory />)
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  expect(screen.getByText(/Order or bundle history is protected/)).toBeVisible(); expect(action).not.toHaveBeenCalled()
})
test('opening and cancelling confirmation has no mutation', async () => {
  render(<DeleteProductForm {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('Practice beads')
  fireEvent.click(screen.getByRole('button', { name: 'Keep product' })); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(action).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Delete' })).toHaveFocus())
})
test('only explicit confirmation submits the saved identity and version, once', async () => {
  let finish!: (value: { success: true }) => void
  action.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(<DeleteProductForm {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' })); fireEvent.click(screen.getByRole('button', { name: 'Delete product permanently' })); fireEvent.click(screen.getByRole('button', { name: 'Deleting…' }))
  expect(action).toHaveBeenCalledTimes(1); expect(action.mock.calls[0][0].get('id')).toBe('product'); expect(action.mock.calls[0][0].get('version')).toBe(props.version)
  await act(async () => { finish({ success: true }) }); expect(screen.getByRole('status')).toHaveTextContent('Product deleted.')
})
test('a new reference or stale version keeps the confirmation and offers reload', async () => {
  action.mockResolvedValue({ success: false, error: 'Product changed. Reload and review it.', code: 'PRODUCT_CHANGED' })
  render(<DeleteProductForm {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' })); fireEvent.click(screen.getByRole('button', { name: 'Delete product permanently' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Product changed')
  expect(screen.getByRole('button', { name: 'Reload product list' })).toBeVisible(); expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
test('transport failures do not claim deletion or expose exception details', async () => {
  action.mockRejectedValue(new Error('private database details'))
  render(<DeleteProductForm {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' })); fireEvent.click(screen.getByRole('button', { name: 'Delete product permanently' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be deleted'); expect(screen.getByRole('dialog')).not.toHaveTextContent('private database details')
})
test('an account change removes pending confirmation and ignores its late response', async () => {
  let finish!: (value: { success: true }) => void
  action.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const { rerender } = render(<DeleteProductForm {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' })); fireEvent.click(screen.getByRole('button', { name: 'Delete product permanently' }))
  auth.useSession.mockReturnValue({ status: 'authenticated', data: { user: { id: 'other-admin', role: 'ADMIN' } } }); rerender(<DeleteProductForm {...props} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => { finish({ success: true }) }); expect(screen.queryByRole('status')).not.toBeInTheDocument()
})
test('a saved-version update invalidates the old open confirmation', async () => {
  const { rerender } = render(<DeleteProductForm {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  rerender(<DeleteProductForm {...props} version={'b'.repeat(64)} />)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument()); expect(action).not.toHaveBeenCalled()
})
