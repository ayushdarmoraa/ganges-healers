import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PostDetailPage from '@/app/community/post/[id]/page'

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'post' }), useRouter: () => ({ push: jest.fn() }) }))
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'reporter' } } }) }))
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }))
const post = { id: 'post', title: 'A mindful discussion', content: 'Discussion content', isPinned: false, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', user: { id: 'author', name: 'Asha', image: null }, topic: null, tags: [], comments: [{ id: 'comment', content: 'A thoughtful reply', createdAt: '2026-10-01T13:00:00Z', updatedAt: '2026-10-01T13:00:00Z', user: { id: 'other', name: 'Ravi', image: null }, hasPendingReport: false }], _count: { likes: 0 }, liked: false, hasPendingReport: false }
const response = (data: object, status = 200) => new Response(JSON.stringify(data), { status })
let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })
beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn(async () => response({ data: post })) as typeof fetch
})

test.each([201, 409])('a submitted or already-pending report is acknowledged and disabled: %s', async status => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? response(status === 201 ? { data: { id: 'report' } } : { error: 'Already reported' }, status) : response({ data: post }))
  render(<PostDetailPage />)
  await user.click(await screen.findByRole('button', { name: 'Report discussion' }))
  await user.type(screen.getByRole('textbox', { name: 'Reason for reporting' }), '  Please review this advice  ')
  await user.click(screen.getByRole('button', { name: 'Submit Report' }))
  expect(await screen.findByRole('button', { name: 'Discussion already reported' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent(status === 201 ? 'submitted for moderator review' : 'already have a pending report')
  const call = (global.fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(call[1].body)).toEqual({ targetType: 'post', targetId: 'post', reason: 'Please review this advice' })
})

test('saved pending state survives opening the discussion and is scoped by target', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(response({ data: { ...post, comments: [{ ...post.comments[0], hasPendingReport: true }] } }))
  render(<PostDetailPage />)
  expect(await screen.findByRole('button', { name: 'Comment already reported' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Report discussion' })).toBeEnabled()
})

test.each([401, 404])('signed-out and missing discussions have distinct recovery paths: %s', async status => {
  ;(global.fetch as jest.Mock).mockResolvedValue(response({}, status))
  render(<PostDetailPage />)
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(status === 401 ? 'Sign in to read' : 'This discussion is unavailable')
  expect(screen.queryByRole('button', { name: 'Post Comment' })).not.toBeInTheDocument()
  if (status === 401) expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/signin')
})

test('a temporary load failure can be retried without being called a missing discussion', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(response({}, 500)).mockImplementation(async () => response({ data: post }))
  render(<PostDetailPage />)
  expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('couldn’t load the discussion')
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('heading', { level: 1, name: post.title })).toBeVisible()
})
