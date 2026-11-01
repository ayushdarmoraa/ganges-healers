import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PostFeed from '@/components/community/PostFeed'
import PostCard, { type CommunityPost } from '@/components/community/PostCard'
import MyDiscussionsPage from '@/app/community/mine/page'
import TagsPage from '@/app/community/tags/page'
import TagPage from '@/app/community/tag/[slug]/page'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/community/tags', () => ({ getCommunityTags: jest.fn(), getCommunityTag: jest.fn() }))
jest.mock('next/navigation', () => ({ redirect: () => { throw new Error('SIGN_IN') }, notFound: () => { throw new Error('NOT_FOUND') } }))
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const tags = jest.requireMock<{ getCommunityTags: jest.Mock; getCommunityTag: jest.Mock }>('@/lib/community/tags')
const tag = { id: 'tag-1', slug: 'mindfulness', name: 'Mindfulness' }
const post: CommunityPost = { id: 'post-1', title: 'A mindful morning', content: 'A new practice.', createdAt: '2026-10-01T12:00:00Z', isPinned: false, user: { id: 'owner', name: 'Asha', image: null }, topic: { id: 'topic-1', slug: 'reiki', name: 'Reiki' }, tags: [{ tag }], _count: { comments: 1, likes: 2 } }
let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })
beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 'owner' } })
  tags.getCommunityTags.mockResolvedValue([tag])
  tags.getCommunityTag.mockResolvedValue(tag)
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ data: [post], nextCursor: null }), { status: 200 })) as typeof fetch
})

test('My Discussions requests the signed-in scope', async () => {
  render(await MyDiscussionsPage())
  expect(await screen.findByRole('link', { name: 'Read discussion: A mindful morning' })).toBeVisible()
  expect(global.fetch).toHaveBeenCalledWith('/api/community/posts?mine=1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
})

test('My Discussions requires sign-in', async () => {
  auth.mockResolvedValue(null)
  await expect(MyDiscussionsPage()).rejects.toThrow('SIGN_IN')
})

test('tag directory and detail pages connect to a scoped feed', async () => {
  const directory = render(await TagsPage())
  expect(screen.getByRole('link', { name: '#Mindfulness' })).toHaveAttribute('href', '/community/tag/mindfulness')
  directory.unmount()
  render(await TagPage({ params: Promise.resolve({ slug: 'mindfulness' }) }))
  expect(screen.getByRole('heading', { level: 1, name: '#Mindfulness' })).toBeVisible()
  await screen.findByRole('link', { name: 'Read discussion: A mindful morning' })
  expect(global.fetch).toHaveBeenCalledWith('/api/community/posts?tagId=tag-1', expect.objectContaining({ signal: expect.any(AbortSignal) }))
})

test('unknown tags return not-found', async () => {
  tags.getCommunityTag.mockResolvedValue(null)
  await expect(TagPage({ params: Promise.resolve({ slug: 'missing' }) })).rejects.toThrow('NOT_FOUND')
})

test('searching and sorting preserve the feed scope and reset pagination', async () => {
  const user = userEvent.setup()
  render(<PostFeed tagId="tag-1" mine />)
  await screen.findByRole('link', { name: 'Read discussion: A mindful morning' })
  await user.type(screen.getByRole('textbox', { name: 'Search discussions' }), 'morning')
  await user.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/community/posts?tagId=tag-1&mine=1&search=morning', expect.anything()))
  await user.click(screen.getByRole('button', { name: 'Most Liked' }))
  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/community/posts?tagId=tag-1&mine=1&sort=most_liked&search=morning', expect.anything()))
  await user.click(screen.getByRole('button', { name: 'Clear search' }))
  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/community/posts?tagId=tag-1&mine=1&sort=most_liked', expect.anything()))
})

test('cards expose independent topic, tag, and discussion links without nested anchors', () => {
  const { container } = render(<PostCard post={post} />)
  expect(screen.getByRole('link', { name: 'Reiki' })).toHaveAttribute('href', '/community/topic/reiki')
  expect(screen.getByRole('link', { name: '#Mindfulness' })).toHaveAttribute('href', '/community/tag/mindfulness')
  expect(screen.getByRole('link', { name: 'Read discussion: A mindful morning' })).toHaveAttribute('href', '/community/post/post-1')
  expect(container.querySelector('a a')).toBeNull()
})
