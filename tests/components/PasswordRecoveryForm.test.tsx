import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PasswordRecoveryForm from '@/components/auth/password-recovery-form'
import ForgotPasswordPage from '@/app/auth/forgot-password/page'
import ResetPasswordPage, { metadata } from '@/app/auth/reset-password/page'
import MetaPixelScript from '@/components/analytics/MetaPixelScript'

jest.mock('next/navigation', () => ({ usePathname: jest.fn(() => '/auth/reset-password') }))
jest.mock('next/script', () => ({ __esModule: true, default: ({ id }: { id: string }) => <div data-testid={id} /> }))
const token = 'a'.repeat(64)
const callbackUrl = '/services/reiki?healerId=chosen'

beforeEach(() => { window.history.replaceState({}, '', '/auth/reset-password'); jest.restoreAllMocks() })
afterEach(() => { jest.restoreAllMocks(); delete process.env.NEXT_PUBLIC_META_PIXEL_ID })

test('request form submits its email and journey but gives no account-existence result', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })))
  const user = userEvent.setup()
  render(<PasswordRecoveryForm mode="request" callbackUrl={callbackUrl} />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('status')).toHaveTextContent('If an account with a password matches that email')
  expect(fetch).toHaveBeenCalledWith('/api/auth/forgot-password', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'customer@example.test', callbackUrl }) }))
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', `/auth/signin?${new URLSearchParams({ callbackUrl })}`)
})

test('request failures retain the address so the customer can retry', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Recovery is temporarily unavailable.' }), { status: 503 }))
  const user = userEvent.setup()
  render(<PasswordRecoveryForm mode="request" />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
  expect(screen.getByLabelText('Email')).toHaveValue('customer@example.test')
  expect(screen.getByRole('button', { name: 'Send reset link' })).toBeEnabled()
})

async function fillPasswords(user: ReturnType<typeof userEvent.setup>, confirmation = 'NewPassword!') {
  await user.type(screen.getByLabelText('New password', { exact: true }), 'NewPassword!')
  await user.type(screen.getByLabelText('Confirm new password'), confirmation)
  await user.click(screen.getByRole('button', { name: 'Reset password' }))
}

test('mismatched passwords are rejected without a request', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch')
  const user = userEvent.setup()
  render(<PasswordRecoveryForm mode="reset" token={token} />)
  await fillPasswords(user, 'DifferentPassword!')
  expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match')
  expect(fetch).not.toHaveBeenCalled()
})

test('reset success clears the editor and returns to sign-in without automatically signing in', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })))
  const user = userEvent.setup()
  render(<PasswordRecoveryForm mode="reset" token={token} callbackUrl={callbackUrl} />)
  await fillPasswords(user)
  expect(await screen.findByRole('status')).toHaveTextContent('Previous sessions have been signed out')
  expect(screen.queryByLabelText('New password', { exact: true })).not.toBeInTheDocument()
  expect(fetch).toHaveBeenCalledWith('/api/auth/reset-password', expect.objectContaining({ body: JSON.stringify({ token, newPassword: 'NewPassword!' }) }))
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', `/auth/signin?${new URLSearchParams({ callbackUrl })}`)
})

test('malformed success responses retain the draft and never claim the password changed', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true })))
  const user = userEvent.setup()
  render(<PasswordRecoveryForm mode="reset" token={token} />)
  await fillPasswords(user)
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be completed')
  expect(screen.getByLabelText('New password', { exact: true })).toHaveValue('NewPassword!')
})

test('opens and removes the email fragment while keeping the token only in form memory', async () => {
  window.history.replaceState({}, '', `/auth/reset-password#token=${token}`)
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true })))
  const user = userEvent.setup()
  render(<PasswordRecoveryForm mode="reset" />)
  await waitFor(() => expect(window.location.hash).toBe(''))
  await fillPasswords(user)
  expect(fetch).toHaveBeenCalledWith('/api/auth/reset-password', expect.objectContaining({ body: JSON.stringify({ token, newPassword: 'NewPassword!' }) }))
})

test.each(['', '#token=invalid', `#token=${token}&token=${token}`])('missing or ambiguous fragments cannot open a password editor (%s)', async fragment => {
  window.history.replaceState({}, '', `/auth/reset-password${fragment}`)
  render(<PasswordRecoveryForm mode="reset" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('incomplete')
  expect(screen.queryByRole('button', { name: 'Reset password' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute('href', '/auth/forgot-password')
})

test('recovery pages reject external return destinations and set private page metadata', async () => {
  render(await ForgotPasswordPage({ searchParams: Promise.resolve({ callbackUrl: 'https://attacker.invalid' }) }))
  expect(screen.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/auth/signin')
  expect(metadata.referrer).toBe('no-referrer')
  expect(metadata.robots).toEqual({ index: false, follow: false })
  const page = await ResetPasswordPage({ searchParams: Promise.resolve({ callbackUrl }) })
  expect(page.props.callbackUrl).toBe(callbackUrl)
})

test.each(['/auth/forgot-password', '/auth/reset-password'])('does not include the advertising pixel on %s', pathname => {
  process.env.NEXT_PUBLIC_META_PIXEL_ID = '123456'
  jest.requireMock<{ usePathname: jest.Mock }>('next/navigation').usePathname.mockReturnValue(pathname)
  const { container } = render(<MetaPixelScript />)
  expect(container).toBeEmptyDOMElement()
})

test('keeps the configured advertising pixel on ordinary catalog pages', () => {
  process.env.NEXT_PUBLIC_META_PIXEL_ID = '123456'
  jest.requireMock<{ usePathname: jest.Mock }>('next/navigation').usePathname.mockReturnValue('/services')
  render(<MetaPixelScript />)
  expect(screen.getByTestId('meta-pixel')).toBeInTheDocument()
})
