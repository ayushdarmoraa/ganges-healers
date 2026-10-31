import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Navbar } from '@/components/navigation/Navbar'
import { NotificationProvider } from '@/components/notifications/NotificationProvider'
import { CartProvider, useCart } from '@/components/store/CartProvider'
import CartDrawer from '@/components/store/CartDrawer'
import SearchPageClient from '@/app/search/SearchPageClient'
import SearchBar from '@/components/search/SearchBar'

jest.mock('next-auth/react', () => ({ useSession: jest.fn(), signOut: jest.fn() }))
jest.mock('next/navigation', () => ({ usePathname: jest.fn(), useRouter: jest.fn(), useSearchParams: jest.fn() }))
jest.mock('@/lib/socket-client', () => ({ getSocket: jest.fn(() => ({ on: jest.fn(), off: jest.fn() })), disconnectSocket: jest.fn() }))
const auth = jest.requireMock<{ useSession: jest.Mock; signOut: jest.Mock }>('next-auth/react')
const navigation = jest.requireMock<{ usePathname: jest.Mock; useRouter: jest.Mock; useSearchParams: jest.Mock }>('next/navigation')
const router = { push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }
const empty = { services: [], healers: [], programs: [], courses: [], products: [], blog: [], audio: [] }
const program = (title = 'Reiki practice') => ({ ...empty, programs: [{ id: title, slug: 'reiki-practice', title, pricePaise: 10000 }] })
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
let account: { id: string; name?: string; email?: string; role?: string; vip?: boolean } | null
let verifiedSession: unknown
let savedFetch: typeof fetch
function setAccount(value: typeof account, loading = false) {
  account = value
  auth.useSession.mockReturnValue({ data: value ? { user: value } : null, status: loading ? 'loading' : value ? 'authenticated' : 'unauthenticated', update: jest.fn().mockResolvedValue(null) })
}
function AddFixture() {
  const { addItem } = useCart()
  return <button onClick={() => addItem({ productId: 'product', title: 'Practice beads', slug: 'practice-beads', pricePaise: 10000, imageUrl: null }, 2)}>Add fixture product</button>
}
const tree = (cart = false) => <NotificationProvider><CartProvider><Navbar />{cart && <><AddFixture /><CartDrawer /></>}</CartProvider></NotificationProvider>
const openSearch = async () => { await userEvent.click(screen.getAllByRole('button', { name: 'Open search' })[0]); return screen.getByRole('textbox', { name: 'Search input' }) }
const openAccount = async () => { await userEvent.click(screen.getAllByRole('button', { name: 'Open user menu' })[0]); return screen.getByRole('dialog', { name: 'Your account' }) }
beforeAll(() => { savedFetch = global.fetch })
afterAll(() => { global.fetch = savedFetch })
beforeEach(() => {
  jest.clearAllMocks(); localStorage.clear(); setAccount(null); verifiedSession = null
  navigation.usePathname.mockReturnValue('/'); navigation.useSearchParams.mockReturnValue(new URLSearchParams()); navigation.useRouter.mockReturnValue(router)
  auth.signOut.mockResolvedValue({ url: 'http://localhost/' })
  global.fetch = jest.fn(async (url: string) => {
    if (url.startsWith('/api/search?')) return reply(program())
    if (url === '/api/auth/session') return reply(verifiedSession)
    if (url.startsWith('/api/notifications')) return reply({ ownerId: account?.id, notifications: [], unreadCount: 0, nextCursor: null })
    throw new Error(`Unexpected request: ${url}`)
  }) as typeof fetch
})

test('mounted search opens with real browse links, focuses its input, and restores trigger focus on Escape', async () => {
  render(tree())
  const trigger = screen.getAllByRole('button', { name: 'Open search' })[0]
  const input = await openSearch()
  expect(input).toHaveFocus()
  expect(screen.getByRole('dialog', { name: 'Search' }).id).toBe(trigger.getAttribute('aria-controls'))
  expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '/blog')
  expect(screen.queryByText('Recent searches')).not.toBeInTheDocument()
  expect(global.fetch).not.toHaveBeenCalled()
  await userEvent.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
})

test('Ctrl/Command-K opens search without stealing shortcuts from editable fields', async () => {
  render(<><input aria-label="Other editor" />{tree()}</>)
  const editor = screen.getByRole('textbox', { name: 'Other editor' })
  editor.focus(); fireEvent.keyDown(editor, { key: 'k', ctrlKey: true })
  expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument()
  editor.blur(); fireEvent.keyDown(document.body, { key: 'k', metaKey: true })
  expect(await screen.findByRole('textbox', { name: 'Search input' })).toHaveFocus()
})

test('typing debounces into the existing search API and suggestions support arrow-key navigation', async () => {
  render(tree())
  const input = await openSearch()
  await userEvent.type(input, 'reiki')
  const result = await screen.findByRole('link', { name: 'Reiki practice' })
  expect(global.fetch).toHaveBeenCalledTimes(1)
  expect(global.fetch).toHaveBeenCalledWith('/api/search?q=reiki', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
  expect(result).toHaveAttribute('href', '/programs/reiki-practice')
  fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })
  expect(input).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}')
  expect(result).toHaveFocus()
  await userEvent.keyboard('{ArrowUp}')
  expect(input).toHaveFocus()
})

test('Enter navigates to the encoded full results URL and clears the palette', async () => {
  render(tree())
  const input = await openSearch()
  fireEvent.change(input, { target: { value: ' reiki & sound ' } })
  fireEvent.submit(input.closest('form')!)
  expect(router.push).toHaveBeenCalledWith('/search?q=reiki%20%26%20sound')
  expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument()
  expect(await openSearch()).toHaveValue('')
})

test('one-character searches do not request suggestions', async () => {
  render(tree())
  await userEvent.type(await openSearch(), 'a')
  expect(screen.getByText(/Enter at least two characters/)).toBeVisible()
  expect(global.fetch).not.toHaveBeenCalled()
})

test.each([500, 200])('HTTP failures and malformed success payloads show recovery, not an empty result: %i', async status => {
  global.fetch = jest.fn(async () => reply({ error: 'not a valid result list' }, status)) as typeof fetch
  render(tree())
  await userEvent.type(await openSearch(), 'reiki')
  expect(await screen.findByRole('alert')).toHaveTextContent('Search could not be loaded')
  expect(screen.queryByText(/No matches yet/)).not.toBeInTheDocument()
  ;(global.fetch as jest.Mock).mockResolvedValue(reply(program()))
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('link', { name: 'Reiki practice' })).toBeVisible()
})

test('a valid empty response has a useful empty state and a full results link', async () => {
  global.fetch = jest.fn(async () => reply(empty)) as typeof fetch
  render(tree())
  await userEvent.type(await openSearch(), 'missing')
  expect(await screen.findByText(/No matches yet/)).toBeVisible()
  expect(screen.getByRole('link', { name: /View all results/ })).toHaveAttribute('href', '/search?q=missing')
})

test('slow results for an older query cannot replace newer suggestions', async () => {
  let finishOld!: (value: Response) => void
  global.fetch = jest.fn((url: string) => url.endsWith('alpha') ? new Promise<Response>(resolve => { finishOld = resolve }) : Promise.resolve(reply(program('New beta practice')))) as typeof fetch
  render(tree())
  const input = await openSearch()
  fireEvent.change(input, { target: { value: 'alpha' } })
  await waitFor(() => expect(finishOld).toBeDefined())
  fireEvent.change(input, { target: { value: 'beta' } })
  expect(await screen.findByRole('link', { name: 'New beta practice' })).toBeVisible()
  await act(async () => { finishOld(reply(program('Old alpha practice'))) })
  expect(screen.queryByRole('link', { name: 'Old alpha practice' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'New beta practice' })).toBeVisible()
})

test('closing a pending search aborts its request and never reopens from a late response', async () => {
  let finish!: (value: Response) => void
  global.fetch = jest.fn(() => new Promise<Response>(resolve => { finish = resolve })) as typeof fetch
  render(tree())
  await userEvent.type(await openSearch(), 'reiki')
  await waitFor(() => expect(finish).toBeDefined())
  const signal = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal
  await userEvent.keyboard('{Escape}')
  expect(signal.aborted).toBe(true)
  await act(async () => { finish(reply(program())) })
  expect(screen.queryByRole('dialog', { name: 'Search' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Reiki practice' })).not.toBeInTheDocument()
})

test('guest account controls provide real sign-in and registration destinations without invented identity', async () => {
  render(tree())
  const menu = await openAccount()
  expect(within(menu).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/signin')
  expect(within(menu).getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register')
  expect(within(menu).queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  expect(screen.queryByText('Asha')).not.toBeInTheDocument()
  expect(within(menu).queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument()
})

test.each([
  ['USER', 'Dashboard', '/dashboard', null],
  ['ADMIN', 'Admin dashboard', '/admin', 'Manage articles'],
  ['HEALER', 'Healer dashboard', '/healer', 'Availability'],
  ['UNKNOWN', 'Dashboard', '/dashboard', null],
])('session identity and role shortcuts use existing destinations: %s', async (role, label, href, shortcut) => {
  setAccount({ id: 'alice', name: 'Alice Example', email: 'alice@example.test', role, vip: false })
  render(tree())
  const menu = await openAccount()
  expect(within(menu).getByText('Alice Example')).toBeVisible()
  expect(within(menu).getByText('alice@example.test')).toBeVisible()
  expect(within(menu).getByRole('link', { name: label! })).toHaveAttribute('href', href)
  if (shortcut) expect(within(menu).getByRole('link', { name: shortcut })).toBeVisible()
  if (role !== 'ADMIN') expect(within(menu).queryByRole('link', { name: 'Admin dashboard' })).not.toBeInTheDocument()
  expect(within(menu).queryByText('VIP member')).not.toBeInTheDocument()
  expect([...menu.querySelectorAll('a')].every(link => link.getAttribute('href') !== '#')).toBe(true)
})

test('the membership badge is based on the actual session flag', async () => {
  setAccount({ id: 'alice', vip: true })
  render(tree())
  expect(within(await openAccount()).getByText('VIP member')).toBeVisible()
})

test('account changes close the old account surface and remove its private profile fields', async () => {
  setAccount({ id: 'alice', email: 'alice@example.test' })
  const view = render(tree())
  await openAccount()
  setAccount({ id: 'bob', email: 'bob@example.test' }); view.rerender(tree())
  expect(screen.queryByText('alice@example.test')).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: 'Your account' })).not.toBeInTheDocument()
  expect(within(await openAccount()).getByText('bob@example.test')).toBeVisible()
})

test('initial session hydration preserves a public search already in progress', async () => {
  setAccount(null, true)
  const view = render(tree())
  const input = await openSearch()
  fireEvent.change(input, { target: { value: 'reiki' } })
  setAccount({ id: 'alice', email: 'alice@example.test' }); view.rerender(tree())
  expect(screen.getByRole('dialog', { name: 'Search' })).toBeVisible()
  expect(screen.getByRole('textbox', { name: 'Search input' })).toHaveValue('reiki')
  expect(await screen.findByRole('link', { name: 'Reiki practice' })).toBeVisible()
})

test('sign-out errors remain actionable and never navigate as though sign-out succeeded', async () => {
  setAccount({ id: 'alice' }); auth.signOut.mockRejectedValue(new Error('Network failed'))
  render(tree())
  await userEvent.click(within(await openAccount()).getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign out could not be confirmed')
  expect(router.replace).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled()
})

test.each(['active-session', 'failed-session-read', 'malformed-client-result'])('ambiguous sign-out outcomes do not claim success: %s', async outcome => {
  setAccount({ id: 'alice' })
  if (outcome === 'active-session') verifiedSession = { user: { id: 'alice' } }
  if (outcome === 'failed-session-read') {
    const original = global.fetch
    global.fetch = jest.fn((url, init) => url === '/api/auth/session' ? Promise.resolve(reply({}, 500)) : original(url, init)) as typeof fetch
  }
  if (outcome === 'malformed-client-result') auth.signOut.mockResolvedValue({ error: 'Failed' })
  render(tree())
  await userEvent.click(within(await openAccount()).getByRole('button', { name: 'Sign out' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign out could not be confirmed')
  expect(router.replace).not.toHaveBeenCalled()
})

test('successful sign-out verifies the session, prevents duplicate submissions, and returns home', async () => {
  let finish!: (value: { url: string }) => void
  setAccount({ id: 'alice' }); auth.signOut.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  render(tree())
  const button = within(await openAccount()).getByRole('button', { name: 'Sign out' })
  fireEvent.click(button); fireEvent.click(button)
  expect(auth.signOut).toHaveBeenCalledTimes(1)
  expect(button).toBeDisabled()
  await act(async () => { finish({ url: 'http://localhost/' }) })
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'))
  expect(auth.signOut).toHaveBeenCalledWith({ redirect: false, redirectTo: '/' })
  expect(global.fetch).toHaveBeenCalledWith('/api/auth/session', { cache: 'no-store' })
  expect(router.refresh).toHaveBeenCalled()
})

test('cart controls use the real shared provider and drawer for quantities and checkout access', async () => {
  render(tree(true))
  await userEvent.click(screen.getByRole('button', { name: 'Add fixture product' }))
  const controls = screen.getAllByRole('button', { name: 'Open cart' })
  controls.forEach(button => expect(button).toHaveAttribute('data-cart-count', '2'))
  await userEvent.click(controls[0])
  const drawer = screen.getByRole('dialog', { name: 'Your Cart (2)' })
  expect(within(drawer).getByText('Practice beads')).toBeVisible()
  await userEvent.click(within(drawer).getByRole('button', { name: 'Increase quantity of Practice beads' }))
  controls.forEach(button => expect(button).toHaveAttribute('data-cart-count', '3'))
  expect(screen.getByRole('link', { name: 'Proceed to Checkout' })).toHaveAttribute('href', '/store/checkout')
  await userEvent.click(screen.getByRole('button', { name: 'Remove Practice beads' }))
  expect(screen.getByText('Your cart is empty')).toBeVisible()
  controls.forEach(button => expect(button).toHaveAttribute('data-cart-count', '0'))
})

test('the mounted header restores persisted cart counts and directs booking to services', async () => {
  localStorage.setItem('ganges-cart', JSON.stringify([{ productId: 'p', slug: 'beads', title: 'Beads', pricePaise: 10000, imageUrl: null, quantity: 4 }]))
  render(tree())
  await waitFor(() => screen.getAllByRole('button', { name: 'Open cart' }).forEach(button => expect(button).toHaveAttribute('data-cart-count', '4')))
  screen.getAllByRole('link', { name: 'Book a Session' }).forEach(link => expect(link).toHaveAttribute('href', '/services'))
})

test('mobile menu account actions are real links and avoid a guest profile placeholder', async () => {
  render(tree())
  await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
  const menu = screen.getByRole('dialog', { name: 'Mobile navigation' })
  expect(within(menu).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/signin')
  expect(within(menu).getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register')
  expect(within(menu).queryByRole('button', { name: 'Profile' })).not.toBeInTheDocument()
})

test('full results errors remain recoverable instead of showing zero matches', async () => {
  navigation.useSearchParams.mockReturnValue(new URLSearchParams('q=reiki'))
  global.fetch = jest.fn(async () => reply({}, 500)) as typeof fetch
  render(<SearchPageClient />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Search could not be loaded')
  expect(screen.queryByText(/No results found/)).not.toBeInTheDocument()
  ;(global.fetch as jest.Mock).mockResolvedValue(reply(program()))
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('link', { name: /Reiki practice/ })).toHaveAttribute('href', '/programs/reiki-practice')
})

test('the legacy bar shares query cancellation and includes blog/product/audio destinations', async () => {
  global.fetch = jest.fn(async () => reply({ ...empty,
    products: [{ id: 'p', slug: 'beads', title: 'Practice beads', pricePaise: 10000, imageUrl: null }],
    blog: [{ id: 'b', slug: 'reiki', title: 'Reiki article', excerpt: null, createdAt: '2026-10-01T12:00:00Z' }],
    audio: [{ id: 'a', slug: 'reiki', title: 'Reiki audio', category: 'Meditation', duration: 10, isPremium: false }],
  })) as typeof fetch
  render(<SearchBar />)
  await userEvent.type(screen.getByRole('textbox', { name: 'Search platform' }), 'reiki')
  expect(await screen.findByRole('link', { name: 'Reiki article' })).toHaveAttribute('href', '/blog/reiki')
  expect(screen.getByRole('link', { name: 'Practice beads' })).toHaveAttribute('href', '/store/beads')
  expect(screen.getByRole('link', { name: 'Reiki audio' })).toHaveAttribute('href', '/audio/reiki')
})
