import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegisterForm } from '@/components/auth/register-form'
import SignInPage from '@/app/auth/signin/page'
import RegisterPage from '@/app/register/page'

jest.mock('next/navigation', () => ({ useRouter: jest.fn(), useSearchParams: jest.fn() }))
jest.mock('next-auth/react', () => ({ getProviders: jest.fn(), signIn: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const router = { push: jest.fn() }
const auth = jest.requireMock<{ getProviders: jest.Mock; signIn: jest.Mock }>('next-auth/react')
const toast = jest.requireMock<{ toast: { success: jest.Mock; error: jest.Mock } }>('sonner').toast

beforeEach(() => {
  jest.clearAllMocks()
  jest.requireMock<{ useRouter: jest.Mock }>('next/navigation').useRouter.mockReturnValue(router)
  jest.requireMock<{ useSearchParams: jest.Mock }>('next/navigation').useSearchParams.mockReturnValue(new URLSearchParams())
  auth.getProviders.mockResolvedValue({ credentials: { id: 'credentials' } })
  auth.signIn.mockResolvedValue({ error: null })
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
  expect(screen.getByRole('link', { name: 'Forgot your password?' })).toHaveAttribute('href', '/auth/forgot-password')
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
  expect(router.push).not.toHaveBeenCalled()
})

test('verified credentials navigate to the customer dashboard', async () => {
  const user = userEvent.setup()
  render(<SignInPage />)
  await user.type(screen.getByLabelText('Email'), 'customer@example.test')
  await user.type(screen.getByLabelText('Password'), 'correct-password')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  await waitFor(() => expect(router.push).toHaveBeenCalledWith('/dashboard'))
  expect(auth.signIn).toHaveBeenCalledWith('credentials', { email: 'customer@example.test', password: 'correct-password', redirect: false })
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
