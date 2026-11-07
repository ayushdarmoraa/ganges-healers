import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BlogEditor from '@/components/blog/BlogEditor'
import BlogManager from '@/components/blog/BlogManager'
import BlogAdminLayout from '@/app/admin/blog/layout'

jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))
jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))
const mockRouter = { push: jest.fn(), replace: jest.fn() }
const guard = jest.requireMock<{ requireCurrentAdmin: jest.Mock }>('@/lib/admin/auth').requireCurrentAdmin
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const draft = { id: 'article', slug: 'daily-practice', title: 'Daily Practice', content: 'A careful article about a daily practice.', excerpt: 'An article summary', imageUrl: null, published: false, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', version: 'a'.repeat(64) }
const response = (data: object, status = 200) => new Response(JSON.stringify(data), { status })
let savedFetch: typeof global.fetch
beforeAll(() => { savedFetch = global.fetch })
afterAll(() => { global.fetch = savedFetch })
beforeEach(() => {
  jest.clearAllMocks()
  guard.mockResolvedValue({ id: 'admin', role: 'ADMIN' })
  auth.mockResolvedValue(null)
  global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return response({ data: { ...draft, ...JSON.parse(String(init.body)), published: false } }, 201)
    if (init?.method === 'PATCH') return response({ data: { ...draft, ...JSON.parse(String(init.body)).changes, version: 'b'.repeat(64) } })
    return response({ data: draft })
  }) as typeof fetch
})

test('the blog admin layout rejects unauthorized sessions before rendering an editor', async () => {
  expect(await BlogAdminLayout({ children: <span>Editor</span> })).toEqual(<span>Editor</span>)
  guard.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }))
  await expect(BlogAdminLayout({ children: <span>Secret</span> })).rejects.toThrow('REDIRECT:/auth/signin')
  auth.mockResolvedValue({ user: { id: 'ordinary-user' } })
  await expect(BlogAdminLayout({ children: <span>Secret</span> })).rejects.toThrow('REDIRECT:/dashboard')
})

test('a new article saves privately and locks its URL after the first save', async () => {
  const user = userEvent.setup()
  render(<BlogEditor />)
  await user.type(screen.getByLabelText('Title'), 'A new practice')
  expect(screen.getByLabelText('URL slug')).toHaveValue('a-new-practice')
  await user.type(screen.getByLabelText('Article content'), 'A new article body.')
  await user.click(screen.getByRole('button', { name: 'Save draft' }))
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/admin/blog/article'))
  expect(screen.getByLabelText('URL slug')).toHaveAttribute('readonly')
  expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
  const sent = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(sent[1].body)).toEqual({ title: 'A new practice', slug: 'a-new-practice', content: 'A new article body.', excerpt: '', imageUrl: '' })
  expect(screen.queryByRole('link', { name: 'Open public article' })).not.toBeInTheDocument()
})

test('preview keeps HTML as text and performs no save', async () => {
  const user = userEvent.setup()
  const { container } = render(<BlogEditor />)
  await user.type(screen.getByLabelText('Title'), 'Safe preview')
  await user.type(screen.getByLabelText('Article content'), '<script>alert(1)</script>')
  await user.click(screen.getByRole('button', { name: 'Preview' }))
  expect(within(screen.getByRole('article', { name: 'Article preview' })).getByText('<script>alert(1)</script>')).toBeVisible()
  expect(container.querySelector('script')).toBeNull()
  expect(global.fetch).not.toHaveBeenCalled()
})

test('publishing requires content review and confirmation before writing', async () => {
  const user = userEvent.setup()
  render(<BlogEditor articleId="article" />)
  await user.click(await screen.findByRole('button', { name: 'Publish' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(draft.content)).toBeVisible()
  expect((global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
  await user.click(within(dialog).getByRole('button', { name: 'Confirm publish' }))
  expect(await screen.findByRole('button', { name: 'Unpublish' })).toBeEnabled()
  const sent = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'PATCH')
  expect(JSON.parse(sent[1].body)).toEqual({ id: 'article', version: draft.version, changes: { published: true } })
})

test('a conflicting edit retains text; cancelling reload keeps the conflict recoverable', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'PATCH'
    ? response({ error: 'Another admin changed this article.', code: 'ARTICLE_CHANGED' }, 409)
    : response({ data: draft }))
  render(<BlogEditor articleId="article" />)
  await user.type(await screen.findByLabelText('Title'), ' Together')
  await user.click(screen.getByRole('button', { name: 'Save draft' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Another admin changed')
  expect(screen.getByLabelText('Title')).toHaveValue('Daily Practice Together')
  await user.click(screen.getByRole('button', { name: 'Reload saved version' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Title')).toHaveValue('Daily Practice Together')
  await user.click(screen.getByRole('button', { name: 'Reload saved version' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reload saved version' }))
  expect(await screen.findByLabelText('Title')).toHaveValue('Daily Practice')
})

test('saving a published article requires a second explicit confirmation', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: RequestInit) => response({ data: { ...draft, published: true, ...(init?.method === 'PATCH' ? JSON.parse(String(init.body)).changes : {}), version: init?.method === 'PATCH' ? 'b'.repeat(64) : draft.version } }))
  render(<BlogEditor articleId="article" />)
  await user.type(await screen.findByLabelText('Title'), ' Revised')
  await user.click(screen.getByRole('button', { name: 'Save live changes' }))
  expect((global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save live changes' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(screen.getByLabelText('Title')).toHaveValue('Daily Practice Revised')
  expect(screen.getByRole('button', { name: 'Save live changes' })).toBeDisabled()
})

test('unsaved text warns before leaving and only leaves after confirmation', async () => {
  const user = userEvent.setup()
  render(<BlogEditor />)
  await user.type(screen.getByLabelText('Title'), 'Unsaved work')
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
  await user.click(screen.getByRole('button', { name: '← Back to articles' }))
  expect(mockRouter.push).not.toHaveBeenCalled()
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByLabelText('Title')).toHaveValue('Unsaved work')
  await user.click(screen.getByRole('button', { name: '← Back to articles' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Leave editor' }))
  expect(mockRouter.push).toHaveBeenCalledWith('/admin/blog')
})

test('discard restores the saved article and does not send a write', async () => {
  const user = userEvent.setup()
  render(<BlogEditor articleId="article" />)
  await user.type(await screen.findByLabelText('Title'), ' Extra')
  await user.click(screen.getByRole('button', { name: 'Discard changes' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Discard changes' }))
  expect(screen.getByLabelText('Title')).toHaveValue(draft.title)
  expect((global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
})

test.each([404, 403])('unavailable/private articles do not render editable content: %s', async status => {
  ;(global.fetch as jest.Mock).mockResolvedValue(response({}, status))
  render(<BlogEditor articleId="missing" />)
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(status === 404 ? 'Article not found' : 'not available to this account')
  expect(screen.queryByLabelText('Article content')).not.toBeInTheDocument()
})

test('a temporary editor load error offers retry rather than a missing-article message', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(response({}, 500)).mockResolvedValueOnce(response({ data: draft }))
  render(<BlogEditor articleId="article" />)
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('couldn’t load')
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByLabelText('Title')).toHaveValue(draft.title)
})

test('the manager exposes public links only for published articles and filters its requests', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValue(response({ data: [draft, { ...draft, id: 'live', title: 'Live article', published: true }], counts: { draft: 1, published: 1 }, nextCursor: null }))
  render(<BlogManager />)
  const privateRow = await screen.findByRole('article', { name: draft.title })
  expect(within(privateRow).queryByRole('link', { name: 'Open public article' })).not.toBeInTheDocument()
  expect(within(screen.getByRole('article', { name: 'Live article' })).getByRole('link', { name: 'Open public article' })).toBeVisible()
  await user.selectOptions(screen.getByRole('combobox', { name: 'Article status' }), 'draft')
  await user.type(screen.getByRole('textbox', { name: 'Search articles' }), 'practice')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/admin/blog?status=draft&limit=25&q=practice', expect.anything()))
})

test('failed manager pagination retains its rows and can be retried', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(response({ data: [draft], nextCursor: 'article' })).mockResolvedValueOnce(response({}, 500)).mockResolvedValueOnce(response({ data: [{ ...draft, id: 'second', title: 'Second article' }], nextCursor: null }))
  render(<BlogManager />)
  await user.click(await screen.findByRole('button', { name: 'Load More' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('current results are preserved')
  expect(screen.getByRole('article', { name: draft.title })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Load More' }))
  expect(await screen.findByRole('article', { name: 'Second article' })).toBeVisible()
})
