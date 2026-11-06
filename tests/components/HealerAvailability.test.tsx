import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AvailabilityPage from '@/app/healer/availability/page'
import { readWeeklyAvailability } from '@/lib/bookings/availability-rules'
jest.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: mockOwner } }, status: 'authenticated' }) }))
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }))
let mockOwner = 'owner'
const toast = jest.requireMock<{ toast: { success: jest.Mock } }>('sonner').toast
const etag = `"availability-${'a'.repeat(64)}"`
const schedule = readWeeklyAvailability({ monday: { start: '08:00', end: '22:00' } })!
let fetchMock: jest.SpyInstance
function response(body: unknown, status = 200, tag: string | null = etag) { return new Response(JSON.stringify(body), { status, headers: tag ? { ETag: tag } : {} }) }
beforeEach(() => {
  mockOwner = 'owner'; jest.clearAllMocks()
  fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ success: true, data: schedule }))
})
afterEach(() => jest.restoreAllMocks())

test('loads owned hours, uses accessible controls and saves the loaded version', async () => {
  const user = userEvent.setup(); render(<AvailabilityPage />)
  const end = await screen.findByLabelText('Monday end')
  await user.selectOptions(end, '24:00')
  fetchMock.mockResolvedValueOnce(response({ success: true, data: { ...schedule, monday: { start: '08:00', end: '24:00' } }, version: etag }, 200, null))
  await user.click(screen.getByRole('button', { name: 'Save Availability' }))
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Availability saved'))
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag } })
  expect(screen.getByRole('switch', { name: 'Tuesday availability' })).toHaveAttribute('aria-checked', 'false')
  expect(screen.getByText(/India time/)).toBeVisible()
})
test('a failed load exposes retry and cannot save a blank replacement schedule', async () => {
  fetchMock.mockResolvedValueOnce(response({ error: 'Unavailable' }, 503))
  const user = userEvent.setup(); render(<AvailabilityPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable')
  expect(screen.queryByRole('button', { name: 'Save Availability' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Retry loading availability' }))
  expect(await screen.findByLabelText('Monday start')).toHaveValue('08:00')
})
test('a stale edit preserves the draft and requires an explicit reload', async () => {
  const user = userEvent.setup(); render(<AvailabilityPage />)
  await user.selectOptions(await screen.findByLabelText('Monday end'), '23:00')
  fetchMock.mockResolvedValueOnce(response({ error: 'Availability changed in another session.' }, 412, null))
  await user.click(screen.getByRole('button', { name: 'Save Availability' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('another session')
  expect(screen.getByLabelText('Monday end')).toHaveValue('23:00')
  expect(screen.getByRole('button', { name: 'Save Availability' })).toBeDisabled()
  expect(toast.success).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Reload saved hours' }))
  expect(await screen.findByLabelText('Monday end')).toHaveValue('22:00')
})
test('malformed successful saves do not announce success or discard the edited hours', async () => {
  const user = userEvent.setup(); render(<AvailabilityPage />)
  await user.selectOptions(await screen.findByLabelText('Monday end'), '23:00')
  fetchMock.mockResolvedValueOnce(response({ success: true }, 200, null))
  await user.click(screen.getByRole('button', { name: 'Save Availability' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed')
  expect(screen.getByLabelText('Monday end')).toHaveValue('23:00')
  expect(toast.success).not.toHaveBeenCalled()
})
test('invalid hours are rejected before a request and a day can be switched off', async () => {
  const user = userEvent.setup(); render(<AvailabilityPage />)
  await user.selectOptions(await screen.findByLabelText('Monday end'), '07:00')
  await user.click(screen.getByRole('button', { name: 'Save Availability' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('start time must be before end time')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('switch', { name: 'Monday availability' }))
  expect(screen.queryByLabelText('Monday start')).not.toBeInTheDocument()
})
test('an account change hides the old draft and ignores its in-flight save result', async () => {
  const user = userEvent.setup(); const view = render(<AvailabilityPage />)
  await user.selectOptions(await screen.findByLabelText('Monday end'), '23:00')
  let finish!: (value: Response) => void
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
  await user.click(screen.getByRole('button', { name: 'Save Availability' }))
  mockOwner = 'next-owner'; view.rerender(<AvailabilityPage />)
  expect(await screen.findByLabelText('Monday end')).toHaveValue('22:00')
  finish(response({ success: true, data: { ...schedule, monday: { start: '08:00', end: '23:00' } }, version: etag }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Availability' })).not.toBeDisabled())
  expect(screen.getByLabelText('Monday end')).toHaveValue('22:00')
  expect(toast.success).not.toHaveBeenCalled()
})
test('a legacy minute value is displayed honestly and must be aligned before a new save', async () => {
  fetchMock.mockResolvedValueOnce(response({ success: true, data: { ...schedule, monday: { start: '08:15', end: '22:00' } } }))
  const user = userEvent.setup(); render(<AvailabilityPage />)
  expect(await screen.findByLabelText('Monday start')).toHaveValue('08:15')
  await user.click(screen.getByRole('button', { name: 'Save Availability' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('30-minute start time')
  expect(fetchMock).toHaveBeenCalledTimes(1)
})
