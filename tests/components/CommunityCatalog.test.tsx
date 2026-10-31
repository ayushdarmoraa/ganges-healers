import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommunityCatalog from '@/components/community/CommunityCatalog'
import CommunityAdminLayout from '@/app/admin/community/layout'

jest.mock('@/lib/community/admin', () => ({ requireCommunityAdmin: jest.fn() }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))
const admin = jest.requireMock<{ requireCommunityAdmin: jest.Mock }>('@/lib/community/admin').requireCommunityAdmin
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const topic = { id: 'topic', kind: 'topic', slug: 'reiki', name: 'Reiki', description: 'Share your practice', order: 10, isActive: true, postCount: 3, createdAt: '2026-10-01T12:00:00Z', version: 'a'.repeat(64) }
const response = (data: object, status = 200) => new Response(JSON.stringify(data), { status })
let savedFetch: typeof global.fetch
beforeAll(() => { savedFetch = global.fetch })
afterAll(() => { global.fetch = savedFetch })
beforeEach(() => {
  jest.clearAllMocks()
  admin.mockResolvedValue({ id: 'admin', role: 'ADMIN' })
  auth.mockResolvedValue(null)
  global.fetch = jest.fn(async () => response({ data: [topic], nextCursor: null })) as typeof fetch
})

test('the shared admin layout guards catalog and moderation pages', async () => {
  expect(await CommunityAdminLayout({ children: <span>Authorized content</span> })).toEqual(<span>Authorized content</span>)
  admin.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  await expect(CommunityAdminLayout({ children: <span>Secret</span> })).rejects.toThrow('REDIRECT:/auth/signin')
  auth.mockResolvedValue({ user: { id: 'ordinary-member' } })
  await expect(CommunityAdminLayout({ children: <span>Secret</span> })).rejects.toThrow('REDIRECT:/dashboard')
})

test('the catalog shows usage, status, permanent links, and ordering', async () => {
  render(<CommunityCatalog />)
  const row = await screen.findByRole('article', { name: 'Reiki' })
  expect(within(row).getByText('3 linked discussions')).toBeVisible()
  expect(within(row).getByText('Display order: 10')).toBeVisible()
  expect(within(row).getByRole('link', { name: 'Open topic' })).toHaveAttribute('href', '/community/topic/reiki')
})

test('creating a topic suggests a slug and submits the form fields', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: RequestInit) => response(init?.method === 'POST' ? { data: topic } : { data: [] }, init?.method === 'POST' ? 201 : 200))
  render(<CommunityCatalog />)
  await screen.findByText('No topics match these filters.')
  await user.click(screen.getByRole('button', { name: 'Create topic' }))
  const dialog = screen.getByRole('dialog')
  await user.type(within(dialog).getByLabelText('Topic name'), 'Daily Practice')
  expect(within(dialog).getByLabelText('URL slug')).toHaveValue('daily-practice')
  await user.type(within(dialog).getByLabelText('Description'), 'A place to practice together')
  await user.clear(within(dialog).getByLabelText('Display order'))
  await user.type(within(dialog).getByLabelText('Display order'), '20')
  await user.click(within(dialog).getByRole('button', { name: 'Create topic' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const sent = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(sent[1].body)).toEqual({ kind: 'topic', name: 'Daily Practice', slug: 'daily-practice', description: 'A place to practice together', order: 20, isActive: true })
})

test('editing keeps the URL read-only and includes the reviewed version', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async () => response({ data: [topic] }))
  render(<CommunityCatalog />)
  await user.click(await screen.findByRole('button', { name: 'Edit Reiki' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('URL slug')).toHaveAttribute('readonly')
  await user.clear(within(dialog).getByLabelText('Topic name'))
  await user.type(within(dialog).getByLabelText('Topic name'), 'Reiki Practice')
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const sent = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'PATCH')
  expect(JSON.parse(sent[1].body)).toEqual({ kind: 'topic', id: topic.id, version: topic.version, changes: { name: 'Reiki Practice', description: topic.description, order: 10 } })
})

test('deactivation is confirmed before a request and explains preservation', async () => {
  const user = userEvent.setup()
  render(<CommunityCatalog />)
  await user.click(await screen.findByRole('button', { name: 'Deactivate Reiki' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('3 linked discussions will be preserved.')).toBeVisible()
  expect((global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
  await user.click(within(dialog).getByRole('button', { name: 'Confirm deactivation' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const sent = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'PATCH')
  expect(JSON.parse(sent[1].body)).toMatchObject({ changes: { isActive: false }, version: topic.version })
})

test('a conflicting edit retains the entered name and offers an explicit refresh', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'PATCH' ? response({ error: 'Another admin changed this item.' }, 409) : response({ data: [topic] }))
  render(<CommunityCatalog />)
  await user.click(await screen.findByRole('button', { name: 'Edit Reiki' }))
  await user.type(screen.getByLabelText('Topic name'), ' Together')
  await user.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Another admin changed')
  expect(screen.getByLabelText('Topic name')).toHaveValue('Reiki Together')
  await user.click(screen.getByRole('button', { name: 'Close & refresh list' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('tag creation offers only fields that tags support', async () => {
  const user = userEvent.setup()
  render(<CommunityCatalog />)
  await user.click(screen.getByRole('button', { name: 'Tags' }))
  await user.click(screen.getByRole('button', { name: 'Create tag' }))
  expect(screen.getByLabelText('Tag name')).toBeVisible()
  expect(screen.queryByLabelText('Display order')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Make this topic active')).not.toBeInTheDocument()
})

test('a failed paginated request preserves rows and retries the same cursor', async () => {
  const user = userEvent.setup()
  const fetchMock = global.fetch as jest.Mock
  fetchMock.mockResolvedValueOnce(response({ data: [topic], nextCursor: 'topic' })).mockResolvedValueOnce(response({}, 500)).mockResolvedValueOnce(response({ data: [{ ...topic, id: 'second', name: 'Meditation' }], nextCursor: null }))
  render(<CommunityCatalog />)
  await user.click(await screen.findByRole('button', { name: 'Load More' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('current results are preserved')
  expect(screen.getByRole('article', { name: 'Reiki' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Load More' }))
  expect(await screen.findByRole('article', { name: 'Meditation' })).toBeVisible()
  expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[2][0])
})

test('loading failure and lost admin access are distinct from an empty catalog', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(response({}, 500)).mockResolvedValueOnce(response({}, 403))
  render(<CommunityCatalog />)
  expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load the catalog')
  expect(screen.queryByText('No topics match these filters.')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('does not have access')
})
