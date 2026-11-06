import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsClient from '@/app/dashboard/settings/SettingsClient'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/dashboard/AvatarUpload', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/auth/EmailVerificationSettings', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/auth/PhoneVerificationSettings', () => ({ __esModule: true, default: () => null, PROFILE_UPDATED_EVENT: 'ganges:profile-updated' }))
jest.mock('@/components/auth/AccountClosureSettings', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/auth/TwoFactorSettings', () => ({ __esModule: true, default: () => null }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
const session = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react').useSession
const refresh = jest.fn()
const toast = jest.requireMock<{ toast: { success: jest.Mock; error: jest.Mock } }>('sonner').toast
const owner = { id: 'owner', profileVersion: 'a'.repeat(64), name: 'Original', email: 'owner@example.test', phone: '', image: '', passwordExists: false }
const response = (name = 'Updated', phone: string | null = null, id = owner.id, version = 'b'.repeat(64)) => new Response(JSON.stringify({ user: { id, name, phone }, profileVersion: version }))
beforeEach(() => { jest.clearAllMocks(); session.mockReturnValue({ data: { user: { id: owner.id } }, status: 'authenticated', update: refresh }); refresh.mockResolvedValue({}) })
afterEach(() => jest.restoreAllMocks())
async function edit() {
  const user = userEvent.setup()
  await user.clear(screen.getByLabelText('Full Name'))
  await user.type(screen.getByLabelText('Full Name'), 'Updated')
  return user
}

test('a confirmed profile save binds its owner/version and advances the next save baseline', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response())
  render(<SettingsClient user={owner} />)
  const user = await edit()
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await within(screen.getByRole('form', { name: 'Edit profile' })).findByRole('status')).toHaveTextContent('Profile updated.')
  expect(fetch).toHaveBeenLastCalledWith('/api/users/me', expect.objectContaining({ headers: { 'Content-Type': 'application/json', 'X-Account-Id': owner.id, 'If-Match': `"${owner.profileVersion}"` }, body: JSON.stringify({ name: 'Updated', phone: null }) }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(fetch).toHaveBeenLastCalledWith('/api/users/me', expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': `"${'b'.repeat(64)}"` }) }))
  expect(refresh).toHaveBeenCalledTimes(2)
})
test.each([new Response(JSON.stringify({ ok: true })), response('Original'), response('Updated', null, 'another'), response('Updated', null, owner.id, 'bad')])('a malformed or mismatched success retains the draft and does not claim a save (%#)', async body => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(body)
  render(<SettingsClient user={owner} />)
  const user = await edit()
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed')
  expect(screen.getByLabelText('Full Name')).toHaveValue('Updated')
  expect(toast.success).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled()
})
test('a conflict retains the draft; only an explicit successful reload discards it and updates the version', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Your saved profile changed.' }), { status: 409 })).mockResolvedValueOnce(response('Newer saved name', '9876543210')).mockResolvedValueOnce(response('Newer saved name', '9876543210'))
  render(<SettingsClient user={owner} />)
  const user = await edit()
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your saved profile changed.')
  expect(screen.getByLabelText('Full Name')).toHaveValue('Updated')
  await user.click(screen.getByRole('button', { name: 'Discard draft and reload' }))
  await waitFor(() => expect(screen.getByLabelText('Full Name')).toHaveValue('Newer saved name'))
  expect(screen.getByLabelText('Phone (Optional)')).toHaveValue('9876543210')
  expect(fetch).toHaveBeenLastCalledWith('/api/users/me', { cache: 'no-store' })
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(fetch).toHaveBeenLastCalledWith('/api/users/me', expect.objectContaining({ headers: expect.objectContaining({ 'If-Match': `"${'b'.repeat(64)}"` }) }))
})
test('a failed reload preserves the current draft and offers a retry', async () => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(response('Reloaded'))
  render(<SettingsClient user={owner} />)
  const user = await edit()
  await user.click(screen.getByRole('button', { name: 'Discard draft and reload' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
  expect(screen.getByLabelText('Full Name')).toHaveValue('Updated')
  await user.click(screen.getByRole('button', { name: 'Discard draft and reload' }))
  await waitFor(() => expect(screen.getByLabelText('Full Name')).toHaveValue('Reloaded'))
})
test('duplicate submits are blocked and inputs stay fixed until the response is known', async () => {
  let resolve!: (value: Response) => void
  const fetch = jest.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(done => { resolve = done }))
  render(<SettingsClient user={owner} />)
  await edit()
  const form = screen.getByRole('form', { name: 'Edit profile' })
  fireEvent.submit(form); fireEvent.submit(form)
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  expect(screen.getByLabelText('Full Name')).toBeDisabled()
  await act(async () => { resolve(response()) })
  await waitFor(() => expect(screen.getByLabelText('Full Name')).toBeEnabled())
})
test('a late response cannot refresh or expose the previous account after the session changes', async () => {
  let resolve!: (value: Response) => void
  jest.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(done => { resolve = done }))
  const view = render(<SettingsClient user={owner} />)
  const user = await edit()
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  session.mockReturnValue({ data: { user: { id: 'another' } }, status: 'authenticated', update: refresh })
  view.rerender(<SettingsClient user={owner} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Your account changed')
  expect(screen.queryByText(owner.email)).not.toBeInTheDocument()
  await act(async () => { resolve(response()) })
  expect(toast.success).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled()
})
test('a saved profile is not reported as failed merely because the account menu refresh failed', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response())
  refresh.mockRejectedValue(new Error('Session refresh failed'))
  render(<SettingsClient user={owner} />)
  const user = await edit()
  await user.click(screen.getByRole('button', { name: 'Save Changes' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Reload the page to refresh your account menu.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
