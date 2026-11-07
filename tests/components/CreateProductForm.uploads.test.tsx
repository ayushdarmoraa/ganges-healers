import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CreateProductForm } from '@/components/admin/create-product-form'
import { PRODUCT_IMAGE_MAX_BYTES } from '@/config/images'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
const auth = jest.requireMock<{ useSession: jest.Mock }>('next-auth/react')
const photo = (name = 'photo.png') => new File(['image'], name, { type: 'image/png' })
const url = (name = 'photo') => `https://photos.public.blob.vercel-storage.com/products/${name}.png`
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const action = jest.fn()
let savedFetch: typeof fetch
const session = (id = 'admin') => auth.useSession.mockReturnValue({ status: 'authenticated', data: { user: { id, role: 'ADMIN' } } })
const mainInput = () => screen.getByLabelText('Product Image', { exact: true })
const galleryInput = () => screen.getByLabelText('Product Gallery', { exact: true })
const create = () => screen.getByRole('button', { name: 'Create Product' })
const form = () => screen.getByLabelText('Title', { exact: true }).closest('form')!
beforeAll(() => { savedFetch = global.fetch })
afterAll(() => { global.fetch = savedFetch })
beforeEach(() => { jest.clearAllMocks(); session(); action.mockResolvedValue(undefined); global.fetch = jest.fn(async () => reply({ url: url() })) as typeof fetch })

test('image controls are keyboard buttons with labelled inputs and explicit limits', () => {
  render(<CreateProductForm formAction={action} />)
  expect(screen.getByRole('button', { name: 'Upload product image' })).toHaveAttribute('type', 'button')
  expect(screen.getByRole('button', { name: 'Add gallery images' })).toHaveAttribute('type', 'button')
  expect(mainInput()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp'); expect(screen.getByText(/up to 4 MB each/)).toBeVisible()
})

test('structured validation failures retain stock and text drafts, while a successful retry clears them', async () => {
  action.mockResolvedValueOnce({ error: 'That URL slug is already in use. Choose another.' }).mockResolvedValueOnce({})
  render(<CreateProductForm formAction={action} />)
  fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Counted draft' } })
  fireEvent.change(screen.getByLabelText('Stock quantity', { exact: true }), { target: { value: '7' } })
  fireEvent.submit(form())
  expect(await screen.findByRole('alert')).toHaveTextContent('That URL slug is already in use')
  expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('Counted draft')
  expect(screen.getByLabelText('Stock quantity', { exact: true })).toHaveValue(7)
  expect((action.mock.calls[0][0] as FormData).get('ownerId')).toBe('admin')
  fireEvent.submit(form())
  expect(await screen.findByText('Product created.')).toBeVisible()
  expect(screen.getByLabelText('Stock quantity', { exact: true })).toHaveValue(null)
})
test('invalid local files do not send provider requests or clear product details', () => {
  render(<CreateProductForm formAction={action} />)
  fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Saved draft title' } })
  const file = photo(); Object.defineProperty(file, 'size', { value: PRODUCT_IMAGE_MAX_BYTES + 1 })
  fireEvent.change(mainInput(), { target: { files: [file] } })
  expect(screen.getByRole('alert')).toHaveTextContent('4 MB'); expect(global.fetch).not.toHaveBeenCalled(); expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('Saved draft title')
})
test('pending uploads block product submission and duplicate requests', async () => {
  let finish!: (value: Response) => void
  global.fetch = jest.fn(() => new Promise<Response>(resolve => { finish = resolve })) as typeof fetch
  render(<CreateProductForm formAction={action} />)
  fireEvent.change(mainInput(), { target: { files: [photo()] } })
  expect(create()).toBeDisabled(); fireEvent.submit(form()); fireEvent.change(mainInput(), { target: { files: [photo('duplicate.png')] } })
  expect(action).not.toHaveBeenCalled(); expect(global.fetch).toHaveBeenCalledTimes(1)
  await act(async () => { finish(reply({ url: url() })) })
  expect(screen.getByAltText('Product')).toHaveAttribute('src', url()); expect(create()).toBeEnabled()
})
test('partial gallery success is kept and retry sends only failed files', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(reply({ url: url('first') })).mockResolvedValueOnce(reply({ error: 'provider failed' }, 500)).mockResolvedValueOnce(reply({ url: url('second') }))
  render(<CreateProductForm formAction={action} />)
  fireEvent.change(galleryInput(), { target: { files: [photo('first.png'), photo('second.png')] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Successful images are kept')
  expect(screen.getByAltText('Gallery 1')).toHaveAttribute('src', url('first')); expect(create()).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Retry failed gallery uploads' }))
  expect(await screen.findByAltText('Gallery 2')).toHaveAttribute('src', url('second'))
  expect(global.fetch).toHaveBeenCalledTimes(3)
  const sent = (global.fetch as jest.Mock).mock.calls.map(call => (call[1].body as FormData).get('file') as File)
  expect(sent.map(file => file.name)).toEqual(['first.png', 'second.png', 'second.png']); expect(create()).toBeEnabled()
})
test('a gallery above the documented limit is rejected before any upload', () => {
  render(<CreateProductForm formAction={action} />)
  fireEvent.change(galleryInput(), { target: { files: Array.from({ length: 9 }, (_, i) => photo(`${i}.png`)) } })
  expect(screen.getByRole('alert')).toHaveTextContent('8 gallery images'); expect(global.fetch).not.toHaveBeenCalled()
})
test('a malformed successful upload response retains the image for explicit retry', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(reply({ url: 'javascript:alert(1)' }))
  render(<CreateProductForm formAction={action} />)
  fireEvent.change(mainInput(), { target: { files: [photo()] } })
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be confirmed')
  expect(screen.queryByAltText('Product')).not.toBeInTheDocument(); expect(create()).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Remove failed image from draft' })); expect(create()).toBeEnabled()
})
test('failed replacement retains the old image until the failure is retried or discarded', async () => {
  ;(global.fetch as jest.Mock).mockResolvedValueOnce(reply({ url: url('old') })).mockResolvedValueOnce(reply({ error: 'Unavailable' }, 503))
  render(<CreateProductForm formAction={action} />)
  fireEvent.change(mainInput(), { target: { files: [photo()] } }); await screen.findByAltText('Product')
  fireEvent.change(mainInput(), { target: { files: [photo('replacement.png')] } }); await screen.findByRole('alert')
  expect(screen.getByAltText('Product')).toHaveAttribute('src', url('old'))
  fireEvent.click(screen.getByRole('button', { name: 'Remove failed image from draft' })); expect(screen.getByAltText('Product')).toHaveAttribute('src', url('old'))
})
test('failed product creation keeps form fields and uploaded URLs, and retry submits only once', async () => {
  action.mockRejectedValueOnce(new Error('database detail must not leak'))
  render(<CreateProductForm formAction={action} />)
  fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Crystal' } })
  fireEvent.change(mainInput(), { target: { files: [photo()] } }); await screen.findByAltText('Product')
  fireEvent.submit(form()); expect(await screen.findByRole('alert')).toHaveTextContent('Your draft is kept')
  expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('Crystal'); expect(screen.getByAltText('Product')).toHaveAttribute('src', url())
  fireEvent.submit(form()); fireEvent.submit(form()); await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Product created.'))
  expect(action).toHaveBeenCalledTimes(2); expect(screen.getByLabelText('Title', { exact: true })).toHaveValue(''); expect(screen.queryByAltText('Product')).not.toBeInTheDocument()
})
test('pending work is aborted and late image responses cannot cross accounts', async () => {
  let finish!: (value: Response) => void
  global.fetch = jest.fn(() => new Promise<Response>(resolve => { finish = resolve })) as typeof fetch
  const { rerender } = render(<CreateProductForm formAction={action} />)
  fireEvent.change(screen.getByLabelText('Title', { exact: true }), { target: { value: 'Private draft' } })
  fireEvent.change(mainInput(), { target: { files: [photo()] } })
  const signal = (global.fetch as jest.Mock).mock.calls[0][1].signal as AbortSignal
  session('different-admin'); rerender(<CreateProductForm formAction={action} />)
  expect(signal.aborted).toBe(true); expect(screen.getByLabelText('Title', { exact: true })).toHaveValue('')
  await act(async () => { finish(reply({ url: url('old-account') })) })
  expect(screen.queryByAltText('Product')).not.toBeInTheDocument(); expect(create()).toBeEnabled()
})
test('sign-out and revoked roles remove the entire unsaved editor', () => {
  const { rerender } = render(<CreateProductForm formAction={action} />)
  auth.useSession.mockReturnValue({ status: 'authenticated', data: { user: { id: 'admin', role: 'USER' } } })
  rerender(<CreateProductForm formAction={action} />)
  expect(screen.getByRole('alert')).toHaveTextContent('administrator'); expect(screen.queryByLabelText('Title', { exact: true })).not.toBeInTheDocument()
})
