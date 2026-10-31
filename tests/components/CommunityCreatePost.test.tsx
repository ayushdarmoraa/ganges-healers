import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreatePostPage from '@/app/community/create/page'
import CreatePostForm from '@/components/community/CreatePostForm'

jest.mock('next/navigation', () => ({ useRouter: () => mockRouter }))
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

const mockRouter = { push: jest.fn(), back: jest.fn() }
const reiki = { id: 'topic-reiki', slug: 'reiki', name: 'Reiki', description: 'Reiki practice' }
const meditation = { id: 'topic-meditation', slug: 'meditation', name: 'Meditation', description: null }
let originalFetch: typeof global.fetch
let fetchMock: jest.Mock
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })

const options = (topics = [reiki, meditation]) => new Response(JSON.stringify({ data: topics }), { status: 200 })
beforeEach(() => {
  jest.clearAllMocks()
  fetchMock = jest.fn(async (url: RequestInfo | URL) => {
    if (String(url) === '/api/community/topics') return options()
    if (String(url) === '/api/community/tags') return new Response(JSON.stringify({ data: [] }), { status: 200 })
    return new Response(JSON.stringify({ data: { id: 'new-post' } }), { status: 201 })
  })
  global.fetch = fetchMock as typeof fetch
})

async function writeDraft(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Title'), 'A new practice')
  await user.type(screen.getByLabelText('Content'), 'What helped me today.')
}

test('the route resolves a topic URL into the selected active topic', async () => {
  render(await CreatePostPage({ searchParams: Promise.resolve({ topic: 'reiki' }) }))
  expect(await screen.findByRole('combobox', { name: 'Topic' })).toHaveValue(reiki.id)
  expect(screen.getByText('Start a discussion in Reiki')).toBeVisible()
  expect(screen.getByRole('link', { name: /Reiki discussions/ })).toHaveAttribute('href', '/community/topic/reiki')
})

test('authors can change the suggested topic before publishing', async () => {
  const user = userEvent.setup()
  render(<CreatePostForm initialTopicSlug="reiki" />)
  const selector = await screen.findByRole('combobox', { name: 'Topic' })
  await user.selectOptions(selector, meditation.id)
  await writeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Publish' }))
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/community/post/new-post'))
  const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(request![1].body)).toEqual({ title: 'A new practice', content: 'What helped me today.', topicId: meditation.id })
})

test('an unknown URL topic is explained and is never sent as a topic ID', async () => {
  const user = userEvent.setup()
  render(<CreatePostForm initialTopicSlug="missing" />)
  expect(await screen.findByRole('combobox', { name: 'Topic' })).toHaveValue('')
  expect(screen.getByText(/That topic is no longer available/)).toBeVisible()
  await writeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Publish' }))
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalled())
  const request = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(request![1].body)).not.toHaveProperty('topicId')
})

test('a failed topic lookup keeps the draft and retries the selection', async () => {
  let topicRequests = 0
  fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
    if (String(url) === '/api/community/topics') return ++topicRequests === 1 ? new Response('{}', { status: 500 }) : options()
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  })
  const user = userEvent.setup()
  render(<CreatePostForm initialTopicSlug="reiki" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Your draft is still here')
  await writeDraft(user)
  expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('combobox', { name: 'Topic' })).toHaveValue(reiki.id)
  expect(screen.getByLabelText('Title')).toHaveValue('A new practice')
  expect(screen.getByLabelText('Content')).toHaveValue('What helped me today.')
})

test('missing optional tags do not block topic selection or publishing', async () => {
  fetchMock.mockImplementation(async (url: RequestInfo | URL) => String(url) === '/api/community/topics' ? options() : new Response('{}', { status: 500 }))
  render(<CreatePostForm initialTopicSlug="reiki" />)
  expect(await screen.findByRole('combobox', { name: 'Topic' })).toHaveValue(reiki.id)
  expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()
  expect(await screen.findByText(/Tags are unavailable/)).toBeVisible()
})

test('a topic removed before publication refreshes options without losing the draft', async () => {
  let topicRequests = 0
  fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
    if (String(url) === '/api/community/topics') return ++topicRequests === 1 ? options() : options([meditation])
    if (String(url) === '/api/community/tags') return new Response(JSON.stringify({ data: [] }), { status: 200 })
    return new Response(JSON.stringify({ code: 'TOPIC_UNAVAILABLE', error: 'Please choose another topic.' }), { status: 400 })
  })
  const user = userEvent.setup()
  render(<CreatePostForm initialTopicSlug="reiki" />)
  await screen.findByRole('combobox', { name: 'Topic' })
  await writeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Publish' }))
  await waitFor(() => expect(topicRequests).toBe(2))
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Topic' })).toHaveValue(''))
  expect(screen.getByText(/That topic is no longer available/)).toBeVisible()
  expect(screen.getByLabelText('Title')).toHaveValue('A new practice')
  expect(screen.getByLabelText('Content')).toHaveValue('What helped me today.')
  expect(mockRouter.push).not.toHaveBeenCalled()
})
