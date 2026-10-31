import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TopicsPage from '@/app/community/topics/page'
import TopicPage from '@/app/community/topic/[slug]/page'
import TopicPosts from '@/components/community/TopicPosts'
import type { CommunityPost } from '@/components/community/PostCard'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/community/topics', () => ({ getCommunityTopics: jest.fn(), getCommunityTopic: jest.fn() }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn(() => { throw new Error('SIGN_IN') }),
  notFound: jest.fn(() => { throw new Error('NOT_FOUND') }),
}))

const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const topics = jest.requireMock<{ getCommunityTopics: jest.Mock; getCommunityTopic: jest.Mock }>('@/lib/community/topics')
const topic = { id: 'topic-1', slug: 'reiki', name: 'Reiki', description: 'Share your Reiki practice.' }
let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })

function post(id: string, title: string): CommunityPost {
  return { id, title, content: 'A community discussion.', isPinned: false, createdAt: '2026-10-01T12:00:00Z', user: { id: 'user-1', name: 'Asha', image: null }, topic, tags: [], _count: { likes: 2, comments: 3 } }
}
const first = post('post-1', 'My first practice')
const second = post('post-2', 'A question about Reiki')
const response = (data: CommunityPost[], nextCursor: string | null = null) => new Response(JSON.stringify({ data, nextCursor }), { status: 200 })

beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 'member' } })
  topics.getCommunityTopics.mockResolvedValue([topic])
  topics.getCommunityTopic.mockResolvedValue(topic)
  global.fetch = jest.fn(async () => response([first])) as typeof fetch
})

test('directory displays topic descriptions and links to the topic page', async () => {
  render(await TopicsPage())
  expect(screen.getByRole('heading', { level: 1, name: 'Community Topics' })).toBeVisible()
  expect(screen.getByText(topic.description)).toBeVisible()
  expect(screen.getByRole('link', { name: /Reiki.*View discussions/ })).toHaveAttribute('href', '/community/topic/reiki')
})

test('the directory requires sign-in before reading topics', async () => {
  auth.mockResolvedValue(null)
  await expect(TopicsPage()).rejects.toThrow('SIGN_IN')
  expect(topics.getCommunityTopics).not.toHaveBeenCalled()
})

test('unknown or inactive topic slugs render not-found', async () => {
  topics.getCommunityTopic.mockResolvedValue(null)
  await expect(TopicPage({ params: Promise.resolve({ slug: 'missing' }) })).rejects.toThrow('NOT_FOUND')
  expect(topics.getCommunityTopic).toHaveBeenCalledWith('missing')
})

test('topic pages show their description and fetch only that topic’s discussions', async () => {
  render(await TopicPage({ params: Promise.resolve({ slug: 'reiki' }) }))
  expect(screen.getByRole('heading', { level: 1, name: 'Reiki' })).toBeVisible()
  expect(screen.getByText(topic.description)).toBeVisible()
  expect(await screen.findByRole('link', { name: 'Read discussion: My first practice' })).toHaveAttribute('href', '/community/post/post-1')
  expect(global.fetch).toHaveBeenCalledWith('/api/community/posts?topicId=topic-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
})

test('load more keeps existing discussions and does not repeat cards', async () => {
  const fetchMock = jest.fn().mockResolvedValueOnce(response([first], 'cursor-1')).mockResolvedValueOnce(response([first, second]))
  global.fetch = fetchMock
  const user = userEvent.setup()
  render(<TopicPosts topicId="topic-1" />)
  await user.click(await screen.findByRole('button', { name: 'Load More' }))
  expect(await screen.findByRole('link', { name: 'Read discussion: A question about Reiki' })).toBeVisible()
  expect(screen.getAllByRole('link', { name: 'Read discussion: My first practice' })).toHaveLength(1)
  expect(fetchMock).toHaveBeenLastCalledWith('/api/community/posts?topicId=topic-1&cursor=cursor-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
  expect(screen.queryByRole('button', { name: 'Load More' })).not.toBeInTheDocument()
})

test('failed pagination preserves loaded posts and allows retry from the same cursor', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(response([first], 'cursor-1')).mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(response([second]))
  const user = userEvent.setup()
  render(<TopicPosts topicId="topic-1" />)
  await user.click(await screen.findByRole('button', { name: 'Load More' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Your place has been saved')
  expect(screen.getByRole('link', { name: 'Read discussion: My first practice' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Load More' }))
  expect(await screen.findByRole('link', { name: 'Read discussion: A question about Reiki' })).toBeVisible()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('initial loading errors can be retried without showing a false empty state', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(new Response('{}', { status: 500 })).mockResolvedValueOnce(response([first]))
  const user = userEvent.setup()
  render(<TopicPosts topicId="topic-1" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load the discussions')
  expect(screen.queryByText('Start the first discussion')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('link', { name: 'Read discussion: My first practice' })).toBeVisible()
})

test('an empty topic invites a new discussion', async () => {
  global.fetch = jest.fn(async () => response([])) as typeof fetch
  render(<TopicPosts topicId="topic-1" />)
  expect(await screen.findByRole('heading', { name: 'Start the first discussion' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Create Post' })).toHaveAttribute('href', '/community/create')
})

test('an expired session asks the reader to sign in', async () => {
  global.fetch = jest.fn(async () => new Response('{}', { status: 401 })) as typeof fetch
  render(<TopicPosts topicId="topic-1" />)
  expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/auth/signin')
})

test('changing topics aborts the old request and ignores its late result', async () => {
  let resolveOld!: (value: Response) => void
  let oldSignal: AbortSignal | undefined
  global.fetch = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => {
    if (String(_url).includes('topic-1')) {
      oldSignal = init?.signal as AbortSignal
      return new Promise<Response>(resolve => { resolveOld = resolve })
    }
    return Promise.resolve(response([second]))
  }) as typeof fetch
  const { rerender } = render(<TopicPosts topicId="topic-1" />)
  rerender(<TopicPosts topicId="topic-2" />)
  expect(await screen.findByRole('link', { name: 'Read discussion: A question about Reiki' })).toBeVisible()
  expect(oldSignal?.aborted).toBe(true)
  await act(async () => { resolveOld(response([first])) })
  await waitFor(() => expect(screen.queryByRole('link', { name: 'Read discussion: My first practice' })).not.toBeInTheDocument())
})
