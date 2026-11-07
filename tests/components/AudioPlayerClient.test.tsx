import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import AudioPlayer from '@/components/audio/AudioPlayerClient'
jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const session = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react').useSession
const row = { id: 'audio', title: 'Quiet listening', category: 'Meditation', duration: 300, description: null, audioUrl: 'https://media.example.test/audio.mp3', isPremium: true, locked: false }
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
let fetchMock: jest.SpyInstance
beforeEach(() => { session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'vip' } } }); jest.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); jest.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {}); fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => json(row)) })
afterEach(() => jest.restoreAllMocks())
test('authorized playback uses a fresh private read', async () => {
  const { container } = render(<AudioPlayer slug="quiet" />); await screen.findByText('Quiet listening')
  expect(container.querySelector('audio')).toHaveAttribute('src', row.audioUrl); expect(fetchMock).toHaveBeenCalledWith('/api/audio/quiet', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
})
test('Strict Mode effect replay restores the media source after its cleanup', async () => {
  const { container } = render(<React.StrictMode><AudioPlayer slug="quiet" /></React.StrictMode>)
  await screen.findByText('Quiet listening')
  expect(container.querySelector('audio')).toHaveAttribute('src', row.audioUrl)
})
test('sign-out immediately removes the old media source and reloads access', async () => {
  const { container, rerender } = render(<AudioPlayer slug="quiet" />); await screen.findByText('Quiet listening')
  fetchMock.mockImplementation(async () => json({ ...row, locked: true, audioUrl: null, reason: 'Sign in to access premium content' }))
  session.mockReturnValue({ status: 'unauthenticated', data: null }); rerender(<AudioPlayer slug="quiet" />)
  expect(container.querySelector('audio')).toBeNull(); expect(await screen.findByRole('link', { name: 'Sign In' })).toBeVisible()
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled(); expect(HTMLMediaElement.prototype.load).toHaveBeenCalled()
})
test('a previous listener response cannot populate another account', async () => {
  let finish!: (value: Response) => void; fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const { container, rerender } = render(<AudioPlayer slug="quiet" />); const first = fetchMock.mock.calls[0][1]
  session.mockReturnValue({ status: 'authenticated', data: { user: { id: 'customer' } } }); fetchMock.mockImplementation(async () => json({ ...row, locked: true, audioUrl: null, reason: 'Membership required' })); rerender(<AudioPlayer slug="quiet" />)
  await screen.findByText('Membership required'); await act(async () => finish(json(row)))
  expect(first.signal.aborted).toBe(true); expect(container.querySelector('audio')).toBeNull()
})
test('changing tracks aborts the previous request and preserves the current result', async () => {
  let finish!: (value: Response) => void; fetchMock.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  const { rerender } = render(<AudioPlayer slug="old" />); const first = fetchMock.mock.calls[0][1]
  fetchMock.mockImplementation(async () => json({ ...row, title: 'New track' })); rerender(<AudioPlayer slug="new" />); await screen.findByText('New track')
  await act(async () => finish(json(row))); expect(first.signal.aborted).toBe(true); expect(screen.queryByText('Quiet listening')).not.toBeInTheDocument()
})
test('malformed responses fail without playback and can be retried', async () => {
  fetchMock.mockResolvedValueOnce(json({ title: 'Unconfirmed track' })); const { container } = render(<AudioPlayer slug="quiet" />)
  expect(await screen.findByText('Failed to load track')).toBeVisible(); expect(container.querySelector('audio')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Retry audio' })); await screen.findByText('Quiet listening')
})
test('provider discovery waits for the account status before loading audio', async () => {
  session.mockReturnValue({ status: 'loading', data: null }); const { rerender } = render(<AudioPlayer slug="quiet" />); expect(fetchMock).not.toHaveBeenCalled()
  session.mockReturnValue({ status: 'unauthenticated', data: null }); rerender(<AudioPlayer slug="quiet" />); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
})
