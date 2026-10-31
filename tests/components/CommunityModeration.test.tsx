import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CommunityModeration from '@/components/community/CommunityModeration'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
const target = { id: 'post', kind: 'post', title: 'A community discussion', content: 'Full content for the moderator to review.', userId: 'author', user: { name: 'Asha' }, createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', deletedAt: null, isPinned: false, postId: 'post', postTitle: 'A community discussion', parentHidden: false, removalType: null, canRestore: false }
const report = { id: 'report', targetType: 'post', targetId: 'post', reason: 'Please review the advice in this discussion', status: 'pending', createdAt: '2026-10-02T12:00:00Z', reviewedAt: null, user: { name: 'Ravi' }, reviewer: null, target }
const response = (data: object, status = 200) => new Response(JSON.stringify(data), { status })
const queue = (data = [report], nextCursor: string | null = null) => ({ data, nextCursor, pendingCount: data.length, counts: { pending: data.length, reviewed: 0, dismissed: 0 } })
let originalFetch: typeof global.fetch
beforeAll(() => { originalFetch = global.fetch })
afterAll(() => { global.fetch = originalFetch })
beforeEach(() => {
  jest.clearAllMocks()
  global.fetch = jest.fn(async () => response(queue())) as typeof fetch
})

test('the queue presents a reason and full content with accessible filters', async () => {
  const user = userEvent.setup()
  render(<CommunityModeration />)
  expect(await screen.findByText(report.reason)).toBeVisible()
  expect(screen.getByRole('combobox', { name: 'Report status' })).toBeVisible()
  await user.click(screen.getByText('Read full content'))
  expect(screen.getByText(target.content)).toBeVisible()
  expect(screen.getByRole('link', { name: 'Open discussion' })).toHaveAttribute('href', '/community/post/post')
})

test('hiding requires confirmation and submits the reviewed content version', async () => {
  const user = userEvent.setup()
  const fetchMock = global.fetch as jest.Mock
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'PATCH' ? response({ success: true, resolvedCount: 1 }) : response(queue()))
  render(<CommunityModeration />)
  await user.click(await screen.findByRole('button', { name: 'Hide & resolve' }))
  expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(0)
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(target.content)).toBeVisible()
  await user.click(within(dialog).getByRole('button', { name: 'Confirm decision' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
  expect(JSON.parse(patch[1].body)).toEqual({ action: 'hide', reportId: 'report', targetType: 'post', targetId: 'post', expectedUpdatedAt: target.updatedAt })
  expect(fetchMock.mock.calls.filter(([, init]) => !init?.method)).toHaveLength(2)
})

test('a stale decision stays open, explains the conflict, and offers a fresh queue', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async (_url: string, init?: RequestInit) => init?.method === 'PATCH' ? response({ error: 'The content changed. Refresh before making a decision.' }, 409) : response(queue()))
  render(<CommunityModeration />)
  await user.click(await screen.findByRole('button', { name: 'Hide & resolve' }))
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm decision' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The content changed')
  await user.click(screen.getByRole('button', { name: 'Refresh queue' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
})

test('pagination preserves and deduplicates rows, while filters reset the cursor', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async (url: string) => response(url.includes('cursor=') ? queue([report, { ...report, id: 'second', reason: 'Another report' }]) : queue([report], 'report')))
  render(<CommunityModeration />)
  await user.click(await screen.findByRole('button', { name: 'Load More' }))
  expect(await screen.findByText('Another report')).toBeVisible()
  expect(screen.getAllByText(report.reason)).toHaveLength(1)
  await user.selectOptions(screen.getByRole('combobox', { name: 'Report status' }), 'reviewed')
  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith('/api/admin/community?view=reports&limit=25&status=reviewed&type=all', expect.anything()))
})

test('content browsing protects author removals and allows moderation restoration', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockImplementation(async (url: string) => response(url.includes('view=content') ? { data: [
    { ...target, id: 'author-removed', deletedAt: target.updatedAt, removalType: 'author', canRestore: false },
    { ...target, id: 'moderator-removed', deletedAt: target.updatedAt, removalType: 'moderation', canRestore: true },
  ] } : queue()))
  render(<CommunityModeration />)
  await user.click(screen.getByRole('button', { name: 'Content' }))
  expect(await screen.findByText('Removed by author')).toBeVisible()
  expect(screen.getByText('Hidden by moderation')).toBeVisible()
  expect(screen.getAllByRole('button', { name: 'Restore content' })).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: 'Restore content' }))
  expect(within(screen.getByRole('dialog')).getByText('This makes the content visible again. Closed reports stay in the review history.')).toBeVisible()
})

test('a load failure offers retry without claiming an empty queue', async () => {
  const user = userEvent.setup()
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(response({}, 500)).mockImplementation(async () => response(queue()))
  render(<CommunityModeration />)
  expect(await screen.findByRole('alert')).toHaveTextContent('couldn’t load moderation data')
  expect(screen.queryByText('No reports match these filters.')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText(report.reason)).toBeVisible()
})

test('lost moderation access is displayed distinctly', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValue(response({}, 403))
  render(<CommunityModeration />)
  expect(await screen.findByRole('alert')).toHaveTextContent('does not have access')
  expect(screen.queryByText('No reports match these filters.')).not.toBeInTheDocument()
})
