import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PhoneVerificationSettings, { PROFILE_UPDATED_EVENT } from '@/components/auth/PhoneVerificationSettings'

const id = 'b780d2eb-bcd2-4b69-afd5-e3d35b04dc2d', phone = '+15555550101'
const status = { ownerId: 'owner', phone, verifiedAt: null, canVerify: true, available: true, retryAt: null, challenge: null }
const pending = { ...status, status: 'pending', retryAt: new Date(Date.now() + 60_000).toISOString(), challenge: { id, expiresAt: new Date(Date.now() + 600_000).toISOString() } }
const approved = { ...status, status: 'verified', verifiedAt: new Date().toISOString() }
const reply = (body: unknown, code = 200) => new Response(JSON.stringify(body), { status: code })
afterEach(() => jest.restoreAllMocks())
async function send() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox'))
  await user.click(screen.getByRole('button', { name: 'Request verification code' }))
  return user
}
test('request acknowledgement is not verification; confirmation uses the current owner/phone/challenge', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(status)).mockResolvedValueOnce(reply(pending)).mockResolvedValueOnce(reply(approved))
  render(<PhoneVerificationSettings userId="owner" />)
  const user = await send()
  expect(await screen.findByText('Verification requested. Enter the code from your SMS.')).toBeVisible()
  expect(screen.queryByText('Phone verified.')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenLastCalledWith('/api/users/me/phone-verification', expect.objectContaining({ body: JSON.stringify({ action: 'request', ownerId: 'owner', phone, consent: true }) }))
  await user.type(screen.getByLabelText('SMS verification code'), '123456')
  await user.click(screen.getByRole('button', { name: 'Verify phone' }))
  expect(await screen.findByText('Phone verified.')).toBeVisible()
  expect(fetch).toHaveBeenLastCalledWith('/api/users/me/phone-verification', expect.objectContaining({ body: JSON.stringify({ action: 'confirm', ownerId: 'owner', phone, challengeId: id, code: '123456' }) }))
  expect(screen.queryByLabelText('SMS verification code')).not.toBeInTheDocument()
})
test('consent is explicit and a provider cooldown prevents immediate resend', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(status)).mockResolvedValueOnce(reply(pending))
  render(<PhoneVerificationSettings userId="owner" />)
  expect(await screen.findByRole('button', { name: 'Request verification code' })).toBeDisabled()
  const user = await send()
  await screen.findByLabelText('SMS verification code')
  await user.click(screen.getByRole('checkbox'))
  expect(screen.getByRole('button', { name: 'Request verification code' })).toBeDisabled()
  expect(screen.getByText(/You can request another code in/)).toBeVisible()
})
test.each([{ ...status, available: false }, { ...status, phone: '9876543210', canVerify: false }, { ...status, phone: null, canVerify: false }])('unavailable SMS and unqualified/missing saved phones cannot claim delivery (%#)', async snapshot => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(snapshot))
  render(<PhoneVerificationSettings userId="owner" />)
  expect(await screen.findByText('Your phone has not been verified.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Request verification code' })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(1)
})
test.each([{ ok: true }, { ...pending, ownerId: 'another' }, { ...pending, phone: '+15555550102' }, { ...approved, verifiedAt: null }])('malformed or changed-account/phone success replies are never displayed as verified (%#)', async body => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(status)).mockResolvedValueOnce(reply(body))
  render(<PhoneVerificationSettings userId="owner" />)
  await send()
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed')
  expect(screen.queryByText('Phone verified.')).not.toBeInTheDocument()
})
test('failed status loads offer a real retry and provider failures retain a truthful unverified state', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValueOnce(reply(status)).mockResolvedValueOnce(reply({ error: 'SMS unavailable' }, 503))
  render(<PhoneVerificationSettings userId="owner" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Refresh phone verification' }))
  await send()
  expect(await screen.findByRole('alert')).toHaveTextContent('SMS unavailable')
  expect(screen.queryByText('Phone verified.')).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledTimes(3)
})
test('incorrect codes are cleared for retry and duplicate confirmation submits are blocked', async () => {
  let resolve!: (value: Response) => void
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(pending)).mockReturnValueOnce(new Promise(done => { resolve = done }))
  render(<PhoneVerificationSettings userId="owner" />)
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('SMS verification code'), '123456')
  const form = screen.getByRole('form', { name: 'Verify phone code' })
  fireEvent.submit(form); fireEvent.submit(form)
  expect(fetch).toHaveBeenCalledTimes(2)
  await act(async () => { resolve(reply({ error: 'Code invalid' }, 400)) })
  expect(await screen.findByRole('alert')).toHaveTextContent('Code invalid')
  expect(screen.getByLabelText('SMS verification code')).toHaveValue('')
})
test('a pending confirmation reply cannot be mistaken for an approved code', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(pending)).mockResolvedValueOnce(reply(pending))
  render(<PhoneVerificationSettings userId="owner" />)
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('SMS verification code'), '123456')
  await user.click(screen.getByRole('button', { name: 'Verify phone' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed')
  expect(screen.queryByText('Phone verified.')).not.toBeInTheDocument()
})
test('late request replies cannot expose or verify a previous signed-in account', async () => {
  let resolve!: (value: Response) => void
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(status)).mockReturnValueOnce(new Promise(done => { resolve = done })).mockResolvedValueOnce(reply({ ...status, ownerId: 'another', phone: '+15555550102', available: false }))
  const view = render(<PhoneVerificationSettings userId="owner" />)
  await send()
  view.rerender(<PhoneVerificationSettings userId="another" />)
  await screen.findByText('+15555550102')
  await act(async () => { resolve(reply(approved)) })
  expect(screen.queryByText(phone)).not.toBeInTheDocument()
  expect(screen.queryByText('Phone verified.')).not.toBeInTheDocument()
})
test('a saved profile change refreshes the phone and discards old consent/code state', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(reply(pending)).mockResolvedValueOnce(reply({ ...status, phone: '+15555550102' }))
  render(<PhoneVerificationSettings userId="owner" />)
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('SMS verification code'), '123456')
  await act(async () => { window.dispatchEvent(new CustomEvent(PROFILE_UPDATED_EVENT, { detail: { ownerId: 'owner' } })) })
  await screen.findByText('+15555550102')
  expect(screen.queryByLabelText('SMS verification code')).not.toBeInTheDocument()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
})
test('React effect replay and focus refresh use authoritative status instead of stale local flags', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => reply(status))
  render(<React.StrictMode><PhoneVerificationSettings userId="owner" /></React.StrictMode>)
  await screen.findByText(phone)
  fetch.mockImplementation(async () => reply(approved))
  fireEvent.focus(window)
  await waitFor(() => expect(screen.getByText('Phone verified.')).toBeVisible())
})
