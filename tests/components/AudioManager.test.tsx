import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AudioManager from '@/components/audio/AudioManager'
import type { AudioDetail } from '@/lib/audio/admin-schema'
jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const session = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react').useSession
const original: AudioDetail = { id: 'track', slug: 'quiet', title: 'Quiet audio', description: 'Saved description', category: 'Meditation', duration: 300, audioUrl: 'https://media.example.test/quiet.mp3', isPremium: false, isPublished: false, createdAt: '2026-01-01T00:00:00.000Z', version: 'a'.repeat(64) }
let saved: AudioDetail, fetchMock: jest.SpyInstance
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
async function handler(url: string, options?: RequestInit) {
  if (!options?.method) return new URL(url, 'http://localhost').searchParams.has('id') ? json({ success: true, data: saved }) : json({ success: true, data: [saved], nextCursor: null })
  const body = JSON.parse(String(options.body))
  if (options.method === 'POST') saved = { ...saved, ...body, id: 'created', isPublished: false, version: 'b'.repeat(64) }
  else saved = { ...saved, ...(body.change.action === 'details' ? body.change.fields : { isPublished: body.change.action === 'publish' }), version: saved.version === 'b'.repeat(64) ? 'c'.repeat(64) : 'b'.repeat(64) }
  return json({ success: true, data: saved })
}
beforeEach(() => { jest.clearAllMocks(); session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'admin', role: 'ADMIN' } } }); saved = { ...original }; fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((url, options) => handler(String(url), options)) })
afterEach(() => jest.restoreAllMocks())
async function open() { render(<AudioManager />); fireEvent.click(await screen.findByRole('button', { name: 'Edit Quiet audio' })); await screen.findByDisplayValue('Saved description') }
function fillNew() { fireEvent.click(screen.getByRole('button', { name: 'New audio track' })); fireEvent.change(screen.getByLabelText('Track title'), { target: { value: 'New meditation' } }); fireEvent.change(screen.getByLabelText('URL slug'), { target: { value: 'new-meditation' } }); fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Meditation' } }) }
test('bounded list filters and search issue private fresh reads', async () => {
  render(<AudioManager />); expect(await screen.findByText('Quiet audio')).toBeVisible()
  fireEvent.change(screen.getByLabelText('Audio status'), { target: { value: 'draft' } }); fireEvent.change(screen.getByLabelText('Search audio'), { target: { value: 'quiet' } }); fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('q=quiet&status=draft&limit=25'), expect.objectContaining({ cache: 'no-store' })))
})
test('creation saves a private draft with optional media and waits for confirmed data', async () => {
  render(<AudioManager />); fillNew(); fireEvent.click(screen.getByRole('button', { name: 'Save audio draft' }))
  expect(await screen.findByText('Audio draft created.')).toBeVisible()
  const call = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!
  expect(JSON.parse(call[1].body)).toMatchObject({ title: 'New meditation', slug: 'new-meditation', audioUrl: '', duration: 300 })
  expect(JSON.parse(call[1].body)).not.toHaveProperty('isPublished')
})
test('unsafe URLs are rejected locally without a write', async () => {
  render(<AudioManager />); fillNew(); fireEvent.change(screen.getByLabelText('Audio URL'), { target: { value: 'http://media.example.test/file.mp3' } }); fireEvent.submit(screen.getByRole('form', { name: 'Audio details' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('HTTPS audio URL')
  expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
})
test('failed creation preserves all draft fields for an explicit retry', async () => {
  fetchMock.mockImplementation((url, options) => options?.method === 'POST' ? Promise.resolve(json({ error: 'Save unavailable' }, 503)) : handler(String(url), options))
  render(<AudioManager />); fillNew(); fireEvent.click(screen.getByRole('button', { name: 'Save audio draft' }))
  expect(await screen.findByText('Save unavailable')).toBeVisible(); expect(screen.getByLabelText('Track title')).toHaveValue('New meditation'); expect(screen.getByLabelText('URL slug')).toHaveValue('new-meditation')
  expect(screen.queryByText('Audio draft created.')).not.toBeInTheDocument()
})
test('malformed success responses cannot announce a created draft', async () => {
  fetchMock.mockImplementation((url, options) => options?.method === 'POST' ? Promise.resolve(json({ success: true, data: { ...original, isPublished: true } })) : handler(String(url), options))
  render(<AudioManager />); fillNew(); fireEvent.click(screen.getByRole('button', { name: 'Save audio draft' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('save was not confirmed'); expect(screen.getByLabelText('Track title')).toHaveValue('New meditation')
})
test('dirty details must be saved before publishing and published audio can be withdrawn', async () => {
  await open(); fireEvent.change(screen.getByLabelText('Track title'), { target: { value: 'Updated title' } }); expect(screen.getByRole('button', { name: 'Publish audio' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Save audio details' })); expect(await screen.findByText('Audio saved.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Publish audio' })); expect(await screen.findByText('Audio published.')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Withdraw audio' })); expect(await screen.findByText('Audio withdrawn.')).toBeVisible()
})
test('a stale review keeps edits and requires explicit reload', async () => {
  fetchMock.mockImplementation((url, options) => options?.method === 'PATCH' ? Promise.resolve(json({ error: 'Audio changed. Review the saved version.', code: 'AUDIO_CHANGED' }, 409)) : handler(String(url), options))
  await open(); fireEvent.change(screen.getByLabelText('Track title'), { target: { value: 'Unsaved title' } }); fireEvent.click(screen.getByRole('button', { name: 'Save audio details' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Audio changed'); expect(screen.getByLabelText('Track title')).toHaveValue('Unsaved title'); expect(screen.getByRole('button', { name: 'Save audio details' })).toBeDisabled()
  saved = { ...saved, title: 'New server title', version: 'b'.repeat(64) }; fireEvent.click(screen.getByRole('button', { name: 'Reload saved track and discard changes' })); expect(await screen.findByDisplayValue('New server title')).toBeVisible()
})
test('network failures retain edits without exposing an exception', async () => {
  fetchMock.mockImplementation((url, options) => options?.method === 'PATCH' ? Promise.reject(new Error('private provider details')) : handler(String(url), options))
  await open(); fireEvent.change(screen.getByLabelText('Track title'), { target: { value: 'Unsaved title' } }); fireEvent.click(screen.getByRole('button', { name: 'Save audio details' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('draft is preserved'); expect(document.body).not.toHaveTextContent('private provider details')
})
test('a pending mutation cannot submit twice', async () => {
  let finish!: (value: Response) => void
  fetchMock.mockImplementation((url, options) => options?.method === 'PATCH' ? new Promise(resolve => { finish = resolve }) : handler(String(url), options))
  await open(); fireEvent.change(screen.getByLabelText('Track title'), { target: { value: 'Unsaved title' } }); const form = screen.getByRole('form', { name: 'Audio details' }); fireEvent.submit(form); fireEvent.submit(form)
  expect(fetchMock.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1)
  await act(async () => finish(json({ success: true, data: { ...saved, title: 'Unsaved title', version: 'b'.repeat(64) } })))
})
test('an account change aborts its pending draft and ignores late confirmation', async () => {
  let finish!: (value: Response) => void
  fetchMock.mockImplementation((url, options) => options?.method === 'POST' ? new Promise(resolve => { finish = resolve }) : handler(String(url), options))
  const { rerender } = render(<AudioManager />); fillNew(); fireEvent.click(screen.getByRole('button', { name: 'Save audio draft' }))
  const request = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')!
  session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'other-admin', role: 'ADMIN' } } }); rerender(<AudioManager />)
  expect(request[1].signal.aborted).toBe(true)
  await act(async () => finish(json({ success: true, data: saved })))
  expect(screen.queryByLabelText('Track title')).not.toBeInTheDocument(); expect(screen.queryByText('Audio draft created.')).not.toBeInTheDocument()
})
test('list failures offer retry without publishing anything', async () => {
  fetchMock.mockResolvedValue(json({ error: 'Unavailable' }, 503)); render(<AudioManager />)
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded'); expect(screen.getByRole('button', { name: 'Retry audio list' })).toBeVisible()
})
test('non-administrator sessions never request audio management', () => {
  session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'customer', role: 'USER' } } }); render(<AudioManager />)
  expect(screen.getByText('Sign in with an administrator account.')).toBeVisible(); expect(fetchMock).not.toHaveBeenCalled()
})
