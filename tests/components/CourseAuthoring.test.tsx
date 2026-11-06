import React from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import CourseManager from '@/components/courses/CourseManager'
import type { CourseDetail } from '@/lib/courses/admin-schema'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const row: CourseDetail = { id: 'course', slug: 'practice', title: 'Practice Course', description: 'A course overview.', pricePaise: 0, imageUrl: null, isActive: false, updatedAt: '2026-11-01T00:00:00.000Z', lessonCount: 1, enrollmentCount: 0, version: 'a'.repeat(64), lessons: [{ id: 'lesson', title: 'First lesson', content: 'Private lesson text.', videoUrl: null, order: 0 }] }
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status })
let savedFetch: typeof fetch
let current: CourseDetail
beforeAll(() => { savedFetch = global.fetch })
afterAll(() => { global.fetch = savedFetch })
beforeEach(() => {
  jest.clearAllMocks(); current = JSON.parse(JSON.stringify(row))
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'admin', role: 'ADMIN' } }, status: 'authenticated' } as ReturnType<typeof useSession>)
  global.fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'POST') {
      current = { ...current, ...JSON.parse(String(init.body)), id: 'new-course', isActive: false, lessonCount: 0, lessons: [] }
      return response({ success: true, data: current }, 201)
    }
    if (init?.method === 'PATCH') {
      const { change } = JSON.parse(String(init.body))
      return response({ success: true, data: { ...current, ...(change.action === 'details' ? change.fields : {}), version: 'b'.repeat(64) } })
    }
    return response(String(url).includes('id=') ? { success: true, data: current } : { success: true, data: [current], nextCursor: null })
  }) as typeof fetch
})
async function open() {
  render(<CourseManager />)
  await userEvent.click(await screen.findByRole('button', { name: 'Manage Practice Course' }))
  return screen.findByRole('region', { name: 'Course editor' })
}

test('loads private lesson controls and submits a versioned content correction', async () => {
  const user = userEvent.setup(), editor = await open()
  const form = await within(editor).findByRole('form', { name: 'Edit lesson First lesson' })
  await user.clear(within(form).getByLabelText('Lesson text'))
  await user.type(within(form).getByLabelText('Lesson text'), '<script>plain lesson content</script>')
  await user.click(within(form).getByRole('button', { name: 'Save lesson' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Course saved.'))
  const sent = (fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'PATCH')
  expect(JSON.parse(sent[1].body)).toEqual({ id: 'course', version: row.version, change: { action: 'edit_lesson', lessonId: 'lesson', fields: { title: 'First lesson', content: '<script>plain lesson content</script>', videoUrl: '' } } })
  expect(document.querySelector('script')).toBeNull()
})

test('a new course saves privately and opens its confirmed editor', async () => {
  const user = userEvent.setup(); render(<CourseManager />)
  await screen.findByRole('button', { name: 'Manage Practice Course' })
  await user.click(screen.getByRole('button', { name: 'New course' }))
  const form = screen.getByRole('region', { name: 'New course draft' })
  await user.type(within(form).getByLabelText('Course title'), 'A New Course')
  await user.type(within(form).getByLabelText('Course description'), 'A new overview.')
  await user.type(within(form).getByLabelText('URL slug'), 'new-practice')
  await user.click(within(form).getByRole('button', { name: 'Create draft' }))
  const sent = (fetch as jest.Mock).mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(sent[1].body)).toEqual({ title: 'A New Course', description: 'A new overview.', pricePaise: 0, imageUrl: '', slug: 'new-practice' })
  await waitFor(() => expect(screen.queryByRole('region', { name: 'New course draft' })).not.toBeInTheDocument())
  expect(screen.getByRole('region', { name: 'Course editor' })).toBeVisible()
})

test('a failed editor load exposes retry without blank editable fields', async () => {
  const implementation = fetch as jest.Mock
  implementation.mockImplementation(async (url: string) => String(url).includes('id=') ? response({ error: 'Saved course unavailable' }, 503) : response({ success: true, data: [row], nextCursor: null }))
  const editor = await open()
  expect(await within(editor).findByRole('alert')).toHaveTextContent('Saved course unavailable')
  expect(within(editor).queryByLabelText('Course title')).not.toBeInTheDocument()
  implementation.mockImplementation(async (url: string) => response(String(url).includes('id=') ? { success: true, data: row } : { success: true, data: [row], nextCursor: null }))
  await userEvent.click(within(editor).getByRole('button', { name: 'Retry saved course' }))
  expect(await within(editor).findByLabelText('Course title')).toHaveValue(row.title)
})

test.each([503, 200])('an unsuccessful or malformed %s save preserves the draft and never reports success', async status => {
  const user = userEvent.setup(), editor = await open()
  const field = await within(editor).findByLabelText('Course title')
  await user.type(field, ' unsaved')
  const implementation = (fetch as jest.Mock).getMockImplementation()!
  ;(fetch as jest.Mock).mockImplementation((url, init) => init?.method === 'PATCH' ? Promise.resolve(response(status === 200 ? { success: true } : { error: 'Save unavailable' }, status)) : implementation(url, init))
  await user.click(within(editor).getByRole('button', { name: 'Save course details' }))
  await within(editor).findByRole('alert')
  expect(field).toHaveValue('Practice Course unsaved')
  expect(within(editor).queryByText('Course saved.')).not.toBeInTheDocument()
})

test('conflicting saves retain text, block another write, and reload only on explicit discard', async () => {
  const user = userEvent.setup(), editor = await open()
  const field = await within(editor).findByLabelText('Course title')
  await user.type(field, ' mine')
  const implementation = (fetch as jest.Mock).getMockImplementation()!
  ;(fetch as jest.Mock).mockImplementation((url, init) => init?.method === 'PATCH' ? Promise.resolve(response({ error: 'Another admin changed this course.', code: 'COURSE_CHANGED' }, 409)) : implementation(url, init))
  await user.click(within(editor).getByRole('button', { name: 'Save course details' }))
  expect(await within(editor).findByRole('alert')).toHaveTextContent('Another admin changed')
  expect(field).toHaveValue('Practice Course mine')
  expect(within(editor).getByRole('button', { name: 'Save course details' })).toBeDisabled()
  current = { ...row, title: 'Saved elsewhere', version: 'c'.repeat(64) }
  await user.click(within(editor).getByRole('button', { name: 'Discard draft and reload saved course' }))
  expect(await within(editor).findByLabelText('Course title')).toHaveValue('Saved elsewhere')
})

test('enrollment-protected courses retain correction controls but hide destructive curriculum actions', async () => {
  current = { ...row, enrollmentCount: 1, isActive: true }
  const editor = await open()
  await within(editor).findByText(/Enrollment records protect this curriculum/)
  expect(within(editor).getByRole('button', { name: 'Save lesson' })).toBeEnabled()
  expect(within(editor).queryByRole('form', { name: 'New lesson' })).not.toBeInTheDocument()
  expect(within(editor).queryByRole('button', { name: 'Remove lesson' })).not.toBeInTheDocument()
  expect(within(editor).queryByRole('button', { name: 'Move First lesson up' })).not.toBeInTheDocument()
  expect(within(editor).queryByText('Delete unpurchased draft')).not.toBeInTheDocument()
})

test('failed lesson creation preserves its text and unrelated unsaved course details', async () => {
  const user = userEvent.setup(), editor = await open()
  const title = await within(editor).findByLabelText('Course title')
  await user.type(title, ' unsaved')
  const form = within(editor).getByRole('form', { name: 'New lesson' })
  await user.type(within(form).getByLabelText('Lesson title'), 'Second lesson')
  await user.type(within(form).getByLabelText('Lesson text'), 'Second lesson draft')
  const implementation = (fetch as jest.Mock).getMockImplementation()!
  ;(fetch as jest.Mock).mockImplementation((url, init) => init?.method === 'PATCH' ? Promise.resolve(response({ error: 'Write unavailable' }, 503)) : implementation(url, init))
  await user.click(within(form).getByRole('button', { name: 'Add lesson' }))
  await within(editor).findByRole('alert')
  expect(within(form).getByLabelText('Lesson text')).toHaveValue('Second lesson draft')
  expect(title).toHaveValue('Practice Course unsaved')
})

test('switching accounts clears an opened private editor', async () => {
  const view = render(<CourseManager />)
  await userEvent.click(await screen.findByRole('button', { name: 'Manage Practice Course' }))
  await screen.findByLabelText('Course title')
  jest.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated' } as ReturnType<typeof useSession>)
  view.rerender(<CourseManager />)
  await waitFor(() => expect(screen.queryByRole('region', { name: 'Course editor' })).not.toBeInTheDocument())
  expect(screen.queryByText('Private lesson text.')).not.toBeInTheDocument()
})

test('unsaved lesson text blocks publication and requires confirmation before closing', async () => {
  const user = userEvent.setup(), editor = await open()
  const lessonForm = await within(editor).findByRole('form', { name: 'Edit lesson First lesson' })
  const field = within(lessonForm).getByLabelText('Lesson text')
  await user.type(field, ' pending revision')
  expect(within(editor).getByRole('button', { name: 'Publish course' })).toBeDisabled()
  const unloading = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unloading)
  expect(unloading.defaultPrevented).toBe(true)
  await user.click(within(editor).getByRole('button', { name: 'Close editor' }))
  const dialog = screen.getByRole('dialog', { name: 'Discard unsaved course changes?' })
  await user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
  expect(field).toHaveValue('Private lesson text. pending revision')
  await user.click(within(editor).getByRole('button', { name: 'Close editor' }))
  await user.click(screen.getByRole('button', { name: 'Discard draft and close' }))
  expect(screen.queryByRole('region', { name: 'Course editor' })).not.toBeInTheDocument()
})
