import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BookingReviewForm from '@/components/bookings/BookingReviewForm'

let onSaved: jest.Mock
const previousFetch = global.fetch
beforeEach(() => {
  onSaved = jest.fn()
  global.fetch = jest.fn(async () => new Response(JSON.stringify({ data: { id: 'review', rating: 4, comment: 'A helpful session.' } }), { status: 201 }))
})
afterEach(() => { global.fetch = previousFetch })
function show(review?: { id: string; rating: number; comment: string | null }) {
  return render(<BookingReviewForm bookingId="booking/owned" serviceName="Yoga Therapy" onSaved={onSaved} review={review} />)
}
async function open() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Write a review' }))
  return user
}

test('requires an explicit accessible rating and explains public visibility', async () => {
  show()
  const user = await open()
  expect(screen.getByRole('form', { name: 'Review Yoga Therapy' })).toBeVisible()
  expect(screen.getByText(/appear publicly with your profile name/)).toBeVisible()
  expect(screen.getAllByRole('radio')).toHaveLength(5)
  expect(screen.getAllByRole('radio').every(radio => !(radio as HTMLInputElement).checked)).toBe(true)
  expect(screen.getByRole('button', { name: 'Submit review' })).toBeDisabled()
  await user.click(screen.getByRole('radio', { name: '4 stars' }))
  expect(screen.getByRole('button', { name: 'Submit review' })).toBeEnabled()
  expect(screen.getByLabelText('Your review (optional)')).toHaveAttribute('maxlength', '2000')
})

test('sends only a rating and trimmed comment to the owned-booking endpoint', async () => {
  show()
  const user = await open()
  await user.click(screen.getByRole('radio', { name: '4 stars' }))
  await user.type(screen.getByLabelText('Your review (optional)'), ' A helpful session. ')
  await user.click(screen.getByRole('button', { name: 'Submit review' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'review', rating: 4, comment: 'A helpful session.' }))
  expect(global.fetch).toHaveBeenCalledWith('/api/bookings/booking%2Fowned/review', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ rating: 4, comment: 'A helpful session.' }),
  }))
})

test('a failed save preserves the draft for a retry', async () => {
  jest.mocked(global.fetch).mockRejectedValueOnce(new Error('Connection interrupted'))
  show()
  const user = await open()
  await user.click(screen.getByRole('radio', { name: '4 stars' }))
  await user.type(screen.getByLabelText('Your review (optional)'), 'A helpful session.')
  await user.click(screen.getByRole('button', { name: 'Submit review' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection interrupted')
  expect(screen.getByLabelText('Your review (optional)')).toHaveValue('A helpful session.')
  expect(screen.getByRole('radio', { name: '4 stars' })).toBeChecked()
  await user.click(screen.getByRole('button', { name: 'Submit review' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
})

test.each([401, 409])('an HTTP %s is visible without reporting success', async status => {
  jest.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'A review already exists for this booking' }), { status }))
  show()
  const user = await open()
  await user.click(screen.getByRole('radio', { name: '1 star' }))
  await user.click(screen.getByRole('button', { name: 'Submit review' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(status === 401 ? 'Please sign in again' : 'A review already exists')
  expect(onSaved).not.toHaveBeenCalled()
})

test('pending submission disables the form and cannot send duplicate clicks', async () => {
  let finish!: (response: Response) => void
  jest.mocked(global.fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  show()
  const user = await open()
  await user.click(screen.getByRole('radio', { name: '4 stars' }))
  await user.dblClick(screen.getByRole('button', { name: 'Submit review' }))
  expect(screen.getByRole('button', { name: 'Saving review…' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel review' })).toBeDisabled()
  expect(screen.getByRole('radio', { name: '4 stars' })).toBeDisabled()
  expect(global.fetch).toHaveBeenCalledTimes(1)
  finish(new Response(JSON.stringify({ data: { id: 'review', rating: 4, comment: null } }), { status: 201 }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
})

test('closing and reopening retains an unsent draft without publishing', async () => {
  show()
  const user = await open()
  await user.type(screen.getByLabelText('Your review (optional)'), 'My draft')
  await user.click(screen.getByRole('button', { name: 'Cancel review' }))
  await open()
  expect(screen.getByLabelText('Your review (optional)')).toHaveValue('My draft')
  expect(global.fetch).not.toHaveBeenCalled()
})

test('a saved review is read-only and markup is displayed as plain text', () => {
  const { container } = show({ id: 'review', rating: 2, comment: '<script>window.bad=true</script>' })
  expect(screen.getByRole('status')).toHaveTextContent('Your review · 2 out of 5 stars')
  expect(screen.getByText('<script>window.bad=true</script>')).toBeVisible()
  expect(container.querySelector('script')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Write a review' })).not.toBeInTheDocument()
})

test.each(['{}', '<html>Sign in required</html>'])('an unconfirmed success response cannot erase the draft (%s)', async body => {
  jest.mocked(global.fetch).mockResolvedValueOnce(new Response(body, { status: 200 }))
  show()
  const user = await open()
  await user.click(screen.getByRole('radio', { name: '4 stars' }))
  await user.type(screen.getByLabelText('Your review (optional)'), 'Keep my draft')
  await user.click(screen.getByRole('button', { name: 'Submit review' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not confirm your saved review')
  expect(screen.getByLabelText('Your review (optional)')).toHaveValue('Keep my draft')
  expect(onSaved).not.toHaveBeenCalled()
})
