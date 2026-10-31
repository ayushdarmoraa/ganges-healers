import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationProvider } from '@/components/notifications/NotificationProvider'
import NotificationBell from '@/components/notifications/NotificationBell'
import NotificationInbox from '@/components/notifications/NotificationInbox'
import NotificationsPage from '@/app/dashboard/notifications/page'
import { Navbar } from '@/components/navigation/Navbar'
import { CartProvider } from '@/components/store/CartProvider'
import type { NotificationItem } from '@/lib/notifications/types'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }), redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
jest.mock('@/lib/socket-client', () => ({ getSocket: jest.fn(), disconnectSocket: jest.fn() }))
const session = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react').useSession
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const socketClient = jest.requireMock<{ getSocket: jest.Mock; disconnectSocket: jest.Mock }>('@/lib/socket-client')
const update = jest.fn().mockResolvedValue(null)
const listeners = new Map<string, () => void>()
const socket = { on: jest.fn((name: string, fn: () => void) => listeners.set(name, fn)), off: jest.fn((name: string) => listeners.delete(name)) }
const item = (id: string, overrides: Partial<NotificationItem> = {}): NotificationItem => ({ id, userId: 'alice', title: `Activity ${id}`, message: `Message ${id}`, type: 'community_comment', read: false, createdAt: '2026-10-01T12:00:00Z', ...overrides })
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status })
let owner: string | null
let rows: NotificationItem[]
let savedFetch: typeof fetch
const list = (items = rows, uid = owner) => ({ ownerId: uid, notifications: items, unreadCount: rows.filter(row => !row.read).length, nextCursor: null })
const signIn = (id: string | null) => { owner = id; session.mockReturnValue({ data: id ? { user: { id } } : null, status: id ? 'authenticated' : 'unauthenticated', update }) }
const tree = (inbox = true) => <NotificationProvider><NotificationBell />{inbox && <NotificationInbox />}</NotificationProvider>
beforeAll(() => { savedFetch = global.fetch })
afterAll(() => { global.fetch = savedFetch })
beforeEach(() => {
  jest.clearAllMocks(); listeners.clear(); update.mockResolvedValue(null); auth.mockResolvedValue(null)
  signIn('alice'); rows = [item('one'), item('two', { type: 'community_like' })]
  socketClient.getSocket.mockReturnValue(socket)
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      const body = JSON.parse(String(init.body))
      if (body.action === 'readAll') rows = rows.map(row => ({ ...row, read: true }))
      else rows = rows.map(row => url.includes(`/${row.id}/`) ? { ...row, read: body.read } : row)
      return response({ ok: true, ownerId: owner, unreadCount: rows.filter(row => !row.read).length })
    }
    const params = new URL(url, 'http://localhost').searchParams
    const filtered = rows.filter(row => (params.get('status') !== 'unread' || !row.read) && (params.get('status') !== 'read' || row.read) && (!params.get('type') || params.get('type') === 'all' || row.type === params.get('type')) && (!params.get('q') || `${row.title} ${row.message}`.toLowerCase().includes(params.get('q')!.toLowerCase())))
    return response(list(filtered))
  }) as typeof fetch
})

test('the server inbox page redirects anonymous visitors and admits signed-in accounts', async () => {
  await expect(NotificationsPage()).rejects.toThrow('REDIRECT:/auth/signin?callbackUrl=%2Fdashboard%2Fnotifications')
  auth.mockResolvedValue({ user: { id: 'alice' } })
  expect(await NotificationsPage()).toEqual(<NotificationInbox />)
})

test('the mounted V2 header wires both responsive bells and closes the mobile menu after inbox navigation', async () => {
  const user = userEvent.setup()
  render(<NotificationProvider><CartProvider><Navbar /><NotificationInbox /></CartProvider></NotificationProvider>)
  await screen.findByRole('article', { name: 'Activity one' })
  const bells = screen.getAllByRole('button', { name: 'Notifications' })
  expect(bells).toHaveLength(2)
  bells.forEach(bell => expect(bell).toHaveAttribute('data-unread-count', '2'))
  expect(screen.queryByRole('button', { name: 'Open notifications' })).not.toBeInTheDocument()
  await user.click(bells[0])
  await user.click(within(screen.getByRole('dialog', { name: 'Notifications' })).getAllByRole('button', { name: 'Mark as read' })[0])
  await waitFor(() => bells.forEach(bell => expect(bell).toHaveAttribute('data-unread-count', '1')))
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: 'Open navigation menu' }))
  const menu = screen.getByRole('dialog', { name: 'Mobile navigation' })
  expect(within(menu).getByRole('link', { name: 'Notifications' })).toHaveAttribute('href', '/dashboard/notifications')
  const inboxLink = within(menu).getByRole('link', { name: 'Notifications' })
  // JSDOM cannot navigate documents; E2E exercises the real destination.
  inboxLink.addEventListener('click', event => event.preventDefault(), { once: true })
  await user.click(inboxLink)
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mobile navigation' })).not.toBeInTheDocument())
})

test('the mounted header hides live notifications and the member inbox link for guests', async () => {
  signIn(null)
  render(<NotificationProvider><CartProvider><Navbar /></CartProvider></NotificationProvider>)
  expect(screen.queryByRole('button', { name: 'Notifications' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Open notifications' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
  expect(screen.queryByRole('link', { name: 'Notifications' })).not.toBeInTheDocument()
  expect(global.fetch).not.toHaveBeenCalled()
})

test('read, unread, and bulk actions keep the inbox and bell on one confirmed count', async () => {
  const user = userEvent.setup()
  render(tree())
  const first = await screen.findByRole('article', { name: 'Activity one' })
  const bell = screen.getByRole('button', { name: 'Notifications' })
  expect(bell).toHaveAttribute('data-unread-count', '2')
  await user.click(within(first).getByRole('button', { name: 'Mark as read' }))
  await waitFor(() => expect(bell).toHaveAttribute('data-unread-count', '1'))
  await user.click(await within(screen.getByRole('article', { name: 'Activity one' })).findByRole('button', { name: 'Mark as unread' }))
  await waitFor(() => expect(bell).toHaveAttribute('data-unread-count', '2'))
  await user.click(screen.getByRole('button', { name: 'Mark all as read' }))
  await waitFor(() => expect(bell).toHaveAttribute('data-unread-count', '0'))
  expect(await within(screen.getByRole('article', { name: 'Activity two' })).findByRole('button', { name: 'Mark as unread' })).toBeEnabled()
  const writes = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'PATCH')
  expect(writes.map(([, init]) => JSON.parse(init.body))).toEqual([{ ownerId: 'alice', read: true }, { ownerId: 'alice', read: false }, { ownerId: 'alice', action: 'readAll' }])
})

test('failed writes remain unread, retain the count, and expose a retryable error', async () => {
  const original = global.fetch
  global.fetch = jest.fn((url, init) => init?.method === 'PATCH' ? Promise.resolve(response({ error: 'Could not save this change.' }, 500)) : original(url, init)) as typeof fetch
  render(tree())
  await userEvent.click(within(await screen.findByRole('article', { name: 'Activity one' })).getByRole('button', { name: 'Mark as read' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save this change.')
  expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('data-unread-count', '2')
  expect(within(screen.getByRole('article', { name: 'Activity one' })).getByRole('button', { name: 'Mark as read' })).toBeEnabled()
})

test('pending individual saves prevent duplicate submissions and bulk collisions', async () => {
  let finish!: (value: Response) => void
  const original = global.fetch
  global.fetch = jest.fn((url, init) => init?.method === 'PATCH' ? new Promise<Response>(resolve => { finish = resolve }) : original(url, init)) as typeof fetch
  render(tree())
  const button = within(await screen.findByRole('article', { name: 'Activity one' })).getByRole('button', { name: 'Mark as read' })
  fireEvent.click(button); fireEvent.click(button)
  expect(button).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Mark all as read' })).toBeDisabled()
  expect((global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1)
  await act(async () => { finish(response({ ok: true, ownerId: 'alice', unreadCount: 2 })) })
})

test('the bell reuses the panel with working read actions, a full-inbox link, and Escape focus', async () => {
  const user = userEvent.setup()
  render(tree(false))
  const bell = screen.getByRole('button', { name: 'Notifications' })
  await waitFor(() => expect(bell).toHaveAttribute('data-unread-count', '2'))
  await user.click(bell)
  const panel = screen.getByRole('dialog', { name: 'Notifications' })
  expect(within(panel).getByRole('link', { name: 'View all notifications' })).toHaveAttribute('href', '/dashboard/notifications')
  await user.click(within(panel).getAllByRole('button', { name: 'Mark as read' })[0])
  await waitFor(() => expect(bell).toHaveAttribute('data-unread-count', '1'))
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(bell).toHaveFocus()
})

test('filters and search use the same scoped API without changing the global unread count', async () => {
  const user = userEvent.setup()
  rows[0].read = true
  render(tree())
  await screen.findByRole('article', { name: 'Activity one' })
  await user.selectOptions(screen.getByLabelText('Read status'), 'unread')
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Activity one' })).not.toBeInTheDocument())
  expect(screen.getByRole('article', { name: 'Activity two' })).toBeVisible()
  await user.selectOptions(screen.getByLabelText('Activity type'), 'community_comment')
  expect(await screen.findByText('No notifications match these filters.')).toBeVisible()
  await user.selectOptions(screen.getByLabelText('Read status'), 'all')
  await screen.findByRole('article', { name: 'Activity one' })
  await user.type(screen.getByRole('textbox', { name: 'Search notifications' }), 'missing')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  expect(await screen.findByText('No notifications match these filters.')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('data-unread-count', '1')
})

test('failed pagination keeps loaded cards and retries the same cursor without duplicate rows', async () => {
  let pageCalls = 0
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes('cursor=one')) { pageCalls++; return pageCalls === 1 ? response({}, 500) : response({ ...list([rows[0], rows[1]]), nextCursor: null }) }
    return response({ ...list([rows[0]]), nextCursor: 'one' })
  }) as typeof fetch
  render(tree())
  await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('More notifications could not be loaded')
  expect(screen.getByRole('article', { name: 'Activity one' })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('article', { name: 'Activity two' })).toBeVisible()
  expect(screen.getAllByRole('article', { name: 'Activity one' })).toHaveLength(1)
  expect(pageCalls).toBe(2)
})

test('duplicate socket hints refresh authoritative counts and preserve paginated history', async () => {
  global.fetch = jest.fn(async (url: string) => response(url.includes('cursor=one') ? list([item('older')]) : url.includes('?') ? { ...list([item('one')]), nextCursor: 'one' } : list())) as typeof fetch
  render(tree())
  await userEvent.click(await screen.findByRole('button', { name: 'Load more' }))
  await screen.findByRole('article', { name: 'Activity older' })
  await waitFor(() => expect(listeners.has('notification')).toBe(true))
  rows = [item('newest'), ...rows]
  await act(async () => { listeners.get('notification')!(); listeners.get('notification')!() })
  expect(await screen.findByText('New activity is available.')).toBeVisible()
  expect(screen.getByRole('article', { name: 'Activity older' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('data-unread-count', '3')
})

test('a late response from the previous account is ignored and the socket is replaced', async () => {
  let finish!: (value: Response) => void
  global.fetch = jest.fn(() => new Promise<Response>(resolve => { finish = resolve })) as typeof fetch
  const view = render(tree(false))
  await waitFor(() => expect(socketClient.getSocket).toHaveBeenCalledWith('alice'))
  signIn('bob')
  global.fetch = jest.fn(async () => response(list([item('bob-only', { userId: 'bob' })], 'bob'))) as typeof fetch
  view.rerender(tree(false))
  await waitFor(() => expect(socketClient.getSocket).toHaveBeenCalledWith('bob'))
  await act(async () => { finish(response(list([item('alice-private')], 'alice'))) })
  await userEvent.click(screen.getByRole('button', { name: 'Notifications' }))
  expect(await screen.findByText('Activity bob-only')).toBeVisible()
  expect(screen.queryByText('Activity alice-private')).not.toBeInTheDocument()
  expect(socketClient.disconnectSocket).toHaveBeenCalled()
})

test('account switching hides loaded inbox history and rejects late mutations across a return to the same account', async () => {
  let finish!: (value: Response) => void
  const original = global.fetch
  global.fetch = jest.fn((url, init) => init?.method === 'PATCH' ? new Promise<Response>(resolve => { finish = resolve }) : original(url, init)) as typeof fetch
  const view = render(tree())
  await userEvent.click(within(await screen.findByRole('article', { name: 'Activity one' })).getByRole('button', { name: 'Mark as read' }))
  signIn('bob'); rows = [item('bob-only', { userId: 'bob' })]; view.rerender(tree())
  expect(screen.queryByRole('article', { name: 'Activity one' })).not.toBeInTheDocument()
  await screen.findByRole('article', { name: 'Activity bob-only' })
  signIn('alice'); rows = [item('returned')]; view.rerender(tree())
  await screen.findByRole('article', { name: 'Activity returned' })
  const before = (global.fetch as jest.Mock).mock.calls.length
  await act(async () => { finish(response({ ownerId: 'alice', ok: true, unreadCount: 0 })) })
  expect((global.fetch as jest.Mock).mock.calls.length).toBe(before)
  expect(screen.getByRole('button', { name: 'Notifications' })).toHaveAttribute('data-unread-count', '1')
})

test.each([401, 200])('expired or mismatched account responses clear private data: %i', async status => {
  global.fetch = jest.fn(async () => response(list([item('private')], 'bob'), status)) as typeof fetch
  render(tree())
  expect(await screen.findByRole('link', { name: 'Sign in to view your notifications' })).toBeVisible()
  expect(screen.queryByRole('article')).not.toBeInTheDocument()
  expect(update).toHaveBeenCalled()
})

test('signed-out state starts no private requests or sockets', async () => {
  signIn(null)
  render(tree())
  expect(await screen.findByRole('link', { name: 'Sign in to view your notifications' })).toBeVisible()
  expect(global.fetch).not.toHaveBeenCalled(); expect(socketClient.getSocket).not.toHaveBeenCalled()
})

test('list errors offer a working retry instead of claiming an empty inbox', async () => {
  const original = global.fetch
  global.fetch = jest.fn(async () => response({}, 500)) as typeof fetch
  render(tree())
  expect(await screen.findByRole('alert')).toHaveTextContent('Your notifications could not be loaded')
  expect(screen.queryByText('No notifications match these filters.')).not.toBeInTheDocument()
  global.fetch = original
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('article', { name: 'Activity one' })).toBeVisible()
})
