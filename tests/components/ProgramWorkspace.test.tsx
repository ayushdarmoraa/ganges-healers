import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import ProgramWorkspace from '@/components/programs/ProgramWorkspace'
import type { ProgramEnrollmentView } from '@/lib/programs/enrollments'
jest.mock('next/navigation', () => ({ useRouter: jest.fn() }))
const refresh = jest.fn()
const row: ProgramEnrollmentView = { id: 'enrollment', status: 'active', pricePaise: 25000, program: { slug: 'test-program', title: 'Test Program' }, customerName: 'Customer', healer: { id: 'healer', name: 'Assigned Practitioner' }, needsReview: false, totalSessions: 1, completedSessions: 0, progressPercent: 0, canManage: false, canAssign: false, sessions: [{ id: null, sessionNumber: 1, durationMin: 60, suggestedAt: '2030-01-01T04:30:00.000Z', scheduledAt: null, completedAt: null, status: 'proposed', meetingLink: null }] }
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }) }
beforeEach(() => { jest.clearAllMocks(); jest.mocked(useRouter).mockReturnValue({ refresh } as never) })
afterEach(() => jest.restoreAllMocks())
test('customers see suggestions and progress without staff controls or false calendar reservations', () => {
  render(<ProgramWorkspace items={[row]} />)
  expect(screen.getByText('Awaiting confirmation')).toBeInTheDocument()
  expect(screen.getByRole('progressbar', { name: 'Test Program progress' })).toHaveValue(0)
  expect(screen.queryByRole('button', { name: 'Confirm session' })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Download calendar' })).not.toBeInTheDocument()
})
test('confirmed appointments expose their owned calendar download', () => {
  render(<ProgramWorkspace items={[{ ...row, sessions: [{ ...row.sessions[0], id: 'session', status: 'scheduled', scheduledAt: '2030-01-01T04:30:00.000Z' }] }]} />)
  expect(screen.getByText('Confirmed')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Download calendar' })).toHaveAttribute('href', '/api/program-enrollments/enrollment/sessions/1/calendar')
})
test('staff scheduling uses available India time and waits for explicit server confirmation', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => options?.method === 'PATCH' ? response({ success: true, data: { id: row.id } }) : response({ success: true, data: { slots: [{ time: '10:00', available: true }, { time: '10:30', available: false }] } }))
  render(<ProgramWorkspace items={[{ ...row, canManage: true }]} />)
  fireEvent.change(screen.getByLabelText('Date for session 1'), { target: { value: '2030-01-01' } })
  await screen.findByRole('option', { name: '10:00' })
  expect(screen.queryByRole('option', { name: '10:30' })).not.toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Time for session 1 (IST)'), '10:00')
  await userEvent.click(screen.getByRole('button', { name: 'Confirm session' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(fetch).toHaveBeenCalledWith('/api/program-enrollments/enrollment', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ action: 'schedule', sessionNumber: 1, scheduledAt: '2030-01-01T04:30:00.000Z', meetingLink: null }) }))
})
test('unconfirmed updates preserve the scheduling draft and never claim success', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => options?.method === 'PATCH' ? response({ ok: true }) : response({ success: true, data: { slots: [{ time: '10:00', available: true }] } }))
  render(<ProgramWorkspace items={[{ ...row, canManage: true }]} />)
  fireEvent.change(screen.getByLabelText('Date for session 1'), { target: { value: '2030-01-01' } })
  await screen.findByRole('option', { name: '10:00' })
  await userEvent.selectOptions(screen.getByLabelText('Time for session 1 (IST)'), '10:00')
  await userEvent.click(screen.getByRole('button', { name: 'Confirm session' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The update could not be confirmed')
  expect(screen.getByLabelText('Date for session 1')).toHaveValue('2030-01-01')
  expect(refresh).not.toHaveBeenCalled()
})
test('availability failures offer a retry and cannot submit a guessed time', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ error: 'Availability unavailable' }, 503))
  render(<ProgramWorkspace items={[{ ...row, canManage: true }]} />)
  fireEvent.change(screen.getByLabelText('Date for session 1'), { target: { value: '2030-01-01' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Availability unavailable')
  expect(screen.getByRole('button', { name: 'Confirm session' })).toBeDisabled()
  fetch.mockImplementation(async () => response({ success: true, data: { slots: [{ time: '10:00', available: true }] } }))
  await userEvent.click(screen.getByRole('button', { name: 'Retry availability' }))
  expect(await screen.findByRole('option', { name: '10:00' })).toBeInTheDocument()
})
test('a future reserved session cannot be completed from the UI', () => {
  render(<ProgramWorkspace items={[{ ...row, canManage: true, sessions: [{ ...row.sessions[0], id: 'session', status: 'scheduled', scheduledAt: '2030-01-01T04:30:00.000Z' }] }]} />)
  expect(screen.getByRole('button', { name: 'Mark session completed' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Pause program' })).toBeDisabled()
})

test('cancelled reservations expose a calendar update while proposals do not fabricate an event', () => {
  render(<ProgramWorkspace items={[{ ...row, sessions: [{ ...row.sessions[0], id: 'session', status: 'cancelled', scheduledAt: '2030-01-01T04:30:00.000Z' }] }]} />)
  expect(screen.getByRole('link', { name: 'Download cancellation' })).toHaveAttribute('href', '/api/program-enrollments/enrollment/sessions/1/calendar')
})

test('an administrator selects a labelled practitioner and confirms assignment', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => response({ success: true, data: { id: row.id } }))
  render(<ProgramWorkspace items={[{ ...row, healer: null, canManage: true, canAssign: true }]} healers={[{ id: 'healer', name: 'Assigned Practitioner' }]} />)
  await userEvent.selectOptions(screen.getByLabelText('Assign practitioner', { exact: true }), 'healer')
  await userEvent.click(screen.getByRole('button', { name: 'Assign practitioner' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  expect(fetch).toHaveBeenCalledWith('/api/program-enrollments/enrollment', expect.objectContaining({ body: JSON.stringify({ action: 'assign', healerId: 'healer' }) }))
})
