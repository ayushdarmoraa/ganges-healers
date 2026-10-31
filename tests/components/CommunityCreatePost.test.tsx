import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CreatePostPage from '@/app/community/create/page'
import CreatePostForm from '@/components/community/CreatePostForm'
import { communityDraftKey } from '@/lib/community/drafts'

jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, redirect: () => { throw new Error('SIGN_IN') } }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn(async () => ({ user: { id: 'member' } })) }))
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
  window.localStorage.clear()
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
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
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
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="missing" />)
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
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
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
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
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
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
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

test('preview shows plain text without publishing and preserves the editor', async () => {
  const user = userEvent.setup()
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
  await screen.findByRole('combobox', { name: 'Topic' })
  await user.type(screen.getByLabelText('Title'), 'Preview my practice')
  await user.type(screen.getByLabelText('Content'), '<script>private draft</script>')
  await user.click(screen.getByRole('button', { name: 'Preview' }))
  const preview = screen.getByRole('article', { name: 'Post preview' })
  expect(preview).toHaveTextContent('<script>private draft</script>')
  expect(preview.querySelector('script')).toBeNull()
  expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Write' }))
  expect(screen.getByLabelText('Title')).toHaveValue('Preview my practice')
  expect(screen.getByLabelText('Content')).toHaveValue('<script>private draft</script>')
})

test('recovers the matching account and topic draft', async () => {
  window.localStorage.setItem(communityDraftKey('member', 'reiki'), JSON.stringify({ version: 1, title: 'Saved question', content: 'My unfinished discussion', topicId: reiki.id, tagIds: [] }))
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
  expect(await screen.findByRole('combobox', { name: 'Topic' })).toHaveValue(reiki.id)
  expect(screen.getByLabelText('Title')).toHaveValue('Saved question')
  expect(screen.getByLabelText('Content')).toHaveValue('My unfinished discussion')
  expect(screen.getByText(/saved draft was restored/)).toBeVisible()
})

test('does not restore another account’s draft', async () => {
  window.localStorage.setItem(communityDraftKey('someone-else', 'reiki'), JSON.stringify({ version: 1, title: 'Other account', content: 'Not this account', topicId: reiki.id, tagIds: [] }))
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
  await screen.findByRole('combobox', { name: 'Topic' })
  expect(screen.getByLabelText('Title')).toHaveValue('')
  expect(screen.getByLabelText('Content')).toHaveValue('')
})

test('saves edits on this device and removes the draft after publication', async () => {
  const user = userEvent.setup()
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
  await screen.findByRole('combobox', { name: 'Topic' })
  await writeDraft(user)
  const key = communityDraftKey('member', 'reiki')
  await waitFor(() => expect(JSON.parse(window.localStorage.getItem(key)!)).toMatchObject({ title: 'A new practice', content: 'What helped me today.' }))
  await user.click(screen.getByRole('button', { name: 'Publish' }))
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith('/community/post/new-post'))
  expect(window.localStorage.getItem(key)).toBeNull()
})

test('discarding a draft requires confirmation and clears it', async () => {
  const user = userEvent.setup()
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
  await screen.findByRole('combobox', { name: 'Topic' })
  await writeDraft(user)
  await user.click(screen.getByRole('button', { name: 'Discard draft' }))
  const dialog = screen.getByRole('dialog', { name: 'Discard this draft?' })
  expect(screen.getByLabelText('Title')).toHaveValue('A new practice')
  await user.click(within(dialog).getByRole('button', { name: 'Discard draft' }))
  expect(screen.getByLabelText('Title')).toHaveValue('')
  expect(screen.getByLabelText('Content')).toHaveValue('')
  expect(window.localStorage.getItem(communityDraftKey('member', 'reiki'))).toBeNull()
})

test('blocked device storage does not prevent writing and publishing', async () => {
  const storage = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  try {
    const user = userEvent.setup()
    render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
    await screen.findByRole('combobox', { name: 'Topic' })
    await writeDraft(user)
    expect(screen.getByText(/Draft saving is unavailable/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled())
  } finally { storage.mockRestore() }
})

test('typing is saved even while the topic list is still loading', async () => {
  let resolveTopics!: (value: Response) => void
  fetchMock.mockImplementation(async (url: RequestInfo | URL) => {
    if (String(url) === '/api/community/topics') return new Promise<Response>(resolve => { resolveTopics = resolve })
    return new Response(JSON.stringify({ data: [] }), { status: 200 })
  })
  const user = userEvent.setup()
  render(<CreatePostForm draftOwnerId="member" initialTopicSlug="reiki" />)
  await writeDraft(user)
  expect(JSON.parse(window.localStorage.getItem(communityDraftKey('member', 'reiki'))!)).toMatchObject({ title: 'A new practice', topicChosen: false })
  resolveTopics(options())
  expect(await screen.findByRole('combobox', { name: 'Topic' })).toHaveValue(reiki.id)
})
