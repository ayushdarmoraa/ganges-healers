import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegisterForm } from '@/components/auth/register-form'
import SignInPage from '@/app/auth/signin/page'
import RegisterPage from '@/app/register/page'
import PasswordResetForm from '@/components/auth/password-reset-form'
import SettingsClient from '@/app/dashboard/settings/SettingsClient'

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))
jest.mock('next-auth/react', () => ({ getProviders: jest.fn(), signIn: jest.fn(), signOut: jest.fn(), useSession: () => ({ update: jest.fn(), data: { user: { id: 'settings-user' } }, status: 'authenticated' }) }))
jest.mock('@/components/dashboard/AvatarUpload', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/auth/EmailVerificationSettings', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/auth/PhoneVerificationSettings', () => ({ __esModule: true, default: () => null, PROFILE_UPDATED_EVENT: 'ganges:profile-updated' }))
jest.mock('@/components/auth/AccountClosureSettings', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/auth/TwoFactorSettings', () => ({ __esModule: true, default: () => null }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const router = { push: jest.fn(), refresh: jest.fn() }
const auth = jest.requireMock<{ getProviders: jest.Mock; signIn: jest.Mock; signOut: jest.Mock }>('next-auth/react')
const toast = jest.requireMock<{ toast: { success: jest.Mock; error: jest.Mock } }>('sonner').toast

beforeEach(() => {
  jest.clearAllMocks()
  jest.requireMock<{ useRouter: jest.Mock }>('next/navigation').useRouter.mockReturnValue(router)
  jest.requireMock<{ useSearchParams: jest.Mock }>('next/navigation').useSearchParams.mockReturnValue(new URLSearchParams())
  auth.getProviders.mockResolvedValue({ credentials: { id: 'credentials' } })
  auth.signIn.mockResolvedValue({ error: null, ok: true })
  auth.signOut.mockResolvedValue({ url: 'http://different-auth-host.example/auth/signin' })
})
afterEach(() => jest.restoreAllMocks())

async function fillRegistration(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Full Name'), 'Test Customer')
  await user.type(screen.getByLabelText('Email', { exact: true }), 'customer@example.test')
  await user.type(screen.getByLabelText('Password', { exact: true }), 'CorrectPassword123!')
  await user.type(screen.getByLabelText('Confirm Password'), 'CorrectPassword123!')
}

test('registration accepts a blank optional phone and submits null', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ user: { id: 'registered' } }), { status: 201 }))
  const user = userEvent.setup()
  render(<RegisterForm />)
  await fillRegistration(user)
  await user.click(screen.getByRole('button', { name: 'Create Account' }))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/auth/signin'))
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toMatchObject({ phone: null, email: 'customer@example.test' })
})

test('registration rejects a short entered phone without submitting', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch')
  const user = userEvent.setup()
  render(<RegisterForm />)
  await fillRegistration(user)
  await user.type(screen.getByLabelText('Phone (Optional)'), '123')
  await user.click(screen.getByRole('button', { name: 'Create Account' }))
  expect(await screen.findByText('Phone must be at least 10 characters')).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
})

test('registration preserves password confirmation validation', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch')
  const user = userEvent.setup()
  render(<RegisterForm />)
  await fillRegistration(user)
  await user.clear(screen.getByLabelText('Confirm Password'))
  await user.type(screen.getByLabelText('Confirm Password'), 'DifferentPassword')
  await user.click(screen.getByRole('button', { name: 'Create Account' }))
  expect(await screen.findByText("Passwords don't match")).toBeVisible()
  expect(fetch).not.toHaveBeenCalled()
})

test('registration shows a server rejection without navigating', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'User with this email or phone already exists' }), { status: 400 }))
  const user = userEvent.setup()
  render(<RegisterForm />)
  await fillRegistration(user)
  await user.click(screen.getByRole('button', { name: 'Create Account' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('User with this email or phone already exists'))
  expect(router.push).not.toHaveBeenCalled()
})

test('sign-in hides Google when it is not returned by the configured providers', async () => {
  render(<SignInPage />)
  await waitFor(() => expect(auth.getProviders).toHaveBeenCalled())
  expect(screen.queryByRole('tab', { name: 'Google' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeVisible()
})

test('sign-in offers a configured Google provider', async () => {
  auth.getProviders.mockResolvedValue({ credentials: { id: 'credentials' }, google: { id: 'google' } })
  const user = userEvent.setup()
  render(<SignInPage />)
  await user.click(await screen.findByRole('tab', { name: 'Google' }))
  await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(auth.signIn).toHaveBeenCalledWith('google', { callbackUrl: '/dashboard' })
})

test('invalid credentials keep the visitor on the sign-in screen', async () => {
  auth.signIn.mockResolvedValue({ error: 'CredentialsSignin' })
  const user = userEvent.setup()
  render(<SignInPage />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'incorrect')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials'))
  expect(screen.getByRole('alert')).toHaveTextContent('Check your Ganges Healers email, password, and authenticator code if enabled.')
  expect(screen.getByLabelText('Email')).toHaveValue('customer@example.test')
  expect(screen.getByLabelText('Password')).toHaveValue('')
  expect(router.push).not.toHaveBeenCalled()
})

test('a failed sign-in clears one-use codes while preserving recovery and registration links', async () => {
  auth.signIn.mockResolvedValue({ error: 'CredentialsSignin', ok: false })
  const user = userEvent.setup(); render(<SignInPage />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'incorrect')
  await user.type(screen.getByLabelText('Authenticator or recovery code (if enabled)'), '123456')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  expect(await screen.findByRole('alert')).toBeVisible()
  expect(screen.getByLabelText('Authenticator or recovery code (if enabled)')).toHaveValue('')
  expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/auth/reset-password')
  expect(screen.getByRole('link', { name: 'Create one' })).toHaveAttribute('href', '/register')
})

test('a network failure stays visible without exposing provider errors or losing the email', async () => {
  auth.signIn.mockRejectedValue(new Error('private-provider-details'))
  const user = userEvent.setup(); render(<SignInPage />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'password')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in is temporarily unavailable. Please try again.')
  expect(document.body).not.toHaveTextContent('private-provider-details')
  expect(screen.getByLabelText('Email')).toHaveValue('customer@example.test')
  expect(router.push).not.toHaveBeenCalled()
})

test('pending sign-in rejects duplicate submissions and clears the old error when retry begins', async () => {
  const user = userEvent.setup(); render(<SignInPage />)
  auth.signIn.mockResolvedValueOnce({ error: 'CredentialsSignin', ok: false })
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'incorrect')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  expect(await screen.findByRole('alert')).toBeVisible()
  let finish: (value: unknown) => void = () => {}
  auth.signIn.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await user.type(screen.getByLabelText('Password'), 'correct-password')
  const form = screen.getByRole('form', { name: 'Sign in' })
  fireEvent.submit(form); fireEvent.submit(form)
  expect(auth.signIn).toHaveBeenCalledTimes(2)
  expect(form).toHaveAttribute('aria-busy', 'true')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await act(async () => finish({ ok: true, error: null }))
  expect(router.push).toHaveBeenCalledWith('/dashboard')
})

test('verified credentials navigate to the customer dashboard', async () => {
  const user = userEvent.setup()
  render(<SignInPage />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'correct-password')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'))
  expect(auth.signIn).toHaveBeenCalledWith('credentials', { email: 'customer@example.test', password: 'correct-password', twoFactorCode: '', redirect: false })
})

test('sign-in submits the authenticator or recovery code with the password', async () => {
  const user = userEvent.setup()
  render(<SignInPage />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'correct-password')
  await user.type(screen.getByLabelText('Authenticator or recovery code (if enabled)'), '123456')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith('credentials', { email: 'customer@example.test', password: 'correct-password', twoFactorCode: '123456', redirect: false }))
})

test('an unconfirmed authentication result cannot announce success', async () => {
  auth.signIn.mockResolvedValue({ error: null })
  const user = userEvent.setup()
  render(<SignInPage />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'correct-password')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid credentials'))
  expect(toast.success).not.toHaveBeenCalled()
  expect(router.push).not.toHaveBeenCalled()
})

const selectedBooking = '/services/reiki-healing?openBooking=1&healerId=h_selected&programSlug=foundation'
function withCallback(value: string) {
  jest.requireMock<{ useSearchParams: jest.Mock }>('next/navigation').useSearchParams.mockReturnValue(new URLSearchParams({ callbackUrl: value }))
}
async function submitSignIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'correct-password')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
}

test('credentials return to the chosen healer and registration link carries the same journey', async () => {
  withCallback(selectedBooking)
  const user = userEvent.setup()
  render(<SignInPage />)
  const register = new URL(screen.getByRole('link', { name: 'Create one' }).getAttribute('href')!, 'https://example.test')
  expect(register.pathname).toBe('/register')
  expect(register.searchParams.get('callbackUrl')).toBe(selectedBooking)
  const recovery = new URL(screen.getByRole('link', { name: 'Forgot your password?' }).getAttribute('href')!, 'https://example.test')
  expect(recovery.pathname).toBe('/auth/reset-password')
  expect(recovery.searchParams.get('callbackUrl')).toBe(selectedBooking)
  await submitSignIn(user)
  await waitFor(() => expect(router.push).toHaveBeenCalledWith(selectedBooking))
})

test('configured Google sign-in preserves the membership destination', async () => {
  withCallback('/dashboard/membership')
  auth.getProviders.mockResolvedValue({ credentials: { id: 'credentials' }, google: { id: 'google' } })
  const user = userEvent.setup()
  render(<SignInPage />)
  await user.click(await screen.findByRole('tab', { name: 'Google' }))
  await user.click(screen.getByRole('button', { name: 'Continue with Google' }))
  expect(auth.signIn).toHaveBeenCalledWith('google', { callbackUrl: '/dashboard/membership' })
})

test.each(['https://evil.example/checkout', '/auth/signin?callbackUrl=/auth/signin'])('unsafe sign-in destinations fall back to the dashboard (%s)', async value => {
  withCallback(value)
  const user = userEvent.setup()
  render(<SignInPage />)
  await submitSignIn(user)
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'))
})

test('ambiguous duplicate callback values use the safe default', async () => {
  jest.requireMock<{ useSearchParams: jest.Mock }>('next/navigation').useSearchParams.mockReturnValue(new URLSearchParams('callbackUrl=%2Fdashboard%2Fmembership&callbackUrl=%2Fservices%2Freiki'))
  const user = userEvent.setup()
  render(<SignInPage />)
  await submitSignIn(user)
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'))
})

test('registration preserves the validated callback when sending a new customer to sign in', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ user: { id: 'registered' } }), { status: 201 }))
  const user = userEvent.setup()
  render(<RegisterForm callbackUrl={selectedBooking} />)
  await fillRegistration(user)
  await user.click(screen.getByRole('button', { name: 'Create Account' }))
  await waitFor(() => expect(router.push).toHaveBeenCalled())
  const destination = new URL(router.push.mock.calls[0][0], 'https://example.test')
  expect(destination.pathname).toBe('/auth/signin')
  expect(destination.searchParams.get('callbackUrl')).toBe(selectedBooking)
})

test('the registration page preserves the callback on its existing-account link', async () => {
  render(await RegisterPage({ searchParams: Promise.resolve({ callbackUrl: selectedBooking }) }))
  const destination = new URL(screen.getByRole('link', { name: 'Sign in' }).getAttribute('href')!, 'https://example.test')
  expect(destination.searchParams.get('callbackUrl')).toBe(selectedBooking)
})

afterEach(() => { window.history.replaceState(null, '', '/') })

test('recovery requests preserve the selected booking and show only the generic account response', async () => {
  withCallback(selectedBooking)
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'If an account uses that email, you will receive a reset link.' }), { status: 200 }))
  const user = userEvent.setup()
  render(<PasswordResetForm />)
  await user.type(await screen.findByLabelText('Email'), 'customer@example.test')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('status')).toHaveTextContent('If an account')
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ email: 'customer@example.test', callbackUrl: selectedBooking })
})

test('an unconfigured delivery provider displays the actual unavailable error', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Password recovery is temporarily unavailable.' }), { status: 503 }))
  const user = userEvent.setup()
  render(<PasswordResetForm />)
  await user.type(await screen.findByLabelText('Email'), 'customer@example.test')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('temporarily unavailable')
  expect(screen.queryByText(/you will receive/)).not.toBeInTheDocument()
})

test('a recovery fragment is removed from the address and submitted only to the confirmation API', async () => {
  const token = 'a'.repeat(64)
  window.history.replaceState(null, '', `/auth/reset-password#token=${token}`)
  withCallback(selectedBooking)
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }))
  const user = userEvent.setup()
  render(<PasswordResetForm />)
  expect(window.location.hash).toBe('')
  await user.type(await screen.findByLabelText('New password', { exact: true }), 'Replacement123!')
  await user.type(screen.getByLabelText('Confirm new password'), 'Replacement123!')
  await user.click(screen.getByRole('button', { name: 'Update password' }))
  expect(await screen.findByText('Password updated')).toBeVisible()
  expect(fetch).toHaveBeenCalledWith('/api/auth/password-reset/confirm', expect.objectContaining({ body: JSON.stringify({ token, newPassword: 'Replacement123!' }) }))
  expect(new URL(screen.getByRole('link', { name: 'Sign in with your new password' }).getAttribute('href')!, 'https://example.test').searchParams.get('callbackUrl')).toBe(selectedBooking)
})

test('mismatched passwords never send a confirmation request', async () => {
  window.history.replaceState(null, '', `/auth/reset-password#token=${'b'.repeat(64)}`)
  const fetch = jest.spyOn(globalThis, 'fetch')
  const user = userEvent.setup()
  render(<PasswordResetForm />)
  await user.type(await screen.findByLabelText('New password', { exact: true }), 'Replacement123!')
  await user.type(screen.getByLabelText('Confirm new password'), 'Different123!')
  await user.click(screen.getByRole('button', { name: 'Update password' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match')
  expect(fetch).not.toHaveBeenCalled()
})

test('a malformed recovery fragment can request a fresh link without retaining the token', async () => {
  window.history.replaceState(null, '', '/auth/reset-password#token=invalid')
  render(<PasswordResetForm />)
  expect(await screen.findByRole('alert')).toHaveTextContent('invalid')
  expect(screen.getByLabelText('Email')).toBeVisible()
  expect(window.location.hash).toBe('')
})

test('a malformed confirmation response never claims the password changed and retains the editor', async () => {
  window.history.replaceState(null, '', `/auth/reset-password#token=${'a'.repeat(64)}`)
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true })))
  const user = userEvent.setup()
  render(<PasswordResetForm />)
  await user.type(await screen.findByLabelText('New password', { exact: true }), 'Replacement123!')
  await user.type(screen.getByLabelText('Confirm new password'), 'Replacement123!')
  await user.click(screen.getByRole('button', { name: 'Update password' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to confirm')
  expect(screen.queryByText('Password updated')).not.toBeInTheDocument()
  expect(screen.getByLabelText('New password', { exact: true })).toHaveValue('Replacement123!')
})

test('a malformed request response does not promise unconfirmed delivery', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true })))
  const user = userEvent.setup()
  render(<PasswordResetForm />)
  await user.type(await screen.findByLabelText('Email'), 'customer@example.test')
  await user.click(screen.getByRole('button', { name: 'Send reset link' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to confirm')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

const settingsUser = { id: 'settings-user', profileVersion: 'a'.repeat(64), name: 'Customer', email: 'customer@example.test', phone: '', image: '', passwordExists: true }
async function submitSettingsPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText('Enter current password'), 'Original123!')
  await user.type(screen.getByPlaceholderText('Enter new password'), 'Replacement123!')
  await user.type(screen.getByPlaceholderText('Confirm new password'), 'Replacement123!')
  await user.click(screen.getByRole('button', { name: 'Change Password' }))
}

test('a confirmed settings password change signs out the revoked current session', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ success: true }))).mockResolvedValueOnce(new Response('null'))
  const user = userEvent.setup()
  render(<SettingsClient user={settingsUser} />)
  await submitSettingsPassword(user)
  await waitFor(() => expect(jest.requireMock<{ signOut: jest.Mock }>('next-auth/react').signOut).toHaveBeenCalledWith({ redirect: false, redirectTo: '/auth/signin' }))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/auth/signin'))
})

test('unconfirmed settings password changes preserve the draft and do not sign out', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true })))
  const user = userEvent.setup()
  render(<SettingsClient user={settingsUser} />)
  await submitSettingsPassword(user)
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Password change could not be confirmed. Please try again.'))
  expect(jest.requireMock<{ signOut: jest.Mock }>('next-auth/react').signOut).not.toHaveBeenCalled()
  expect(screen.getByPlaceholderText('Enter new password')).toHaveValue('Replacement123!')
})
