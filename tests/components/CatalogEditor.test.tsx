import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogEditor } from '@/components/admin/catalog-editor'

function editor(action: (data: FormData) => Promise<{ error?: string }>, create = false) {
  render(<CatalogEditor action={action} item="Service" create={create}>
    <label>Name <input name="name" defaultValue={create ? '' : 'Saved service'} /></label>
  </CatalogEditor>)
  return screen.getByRole('textbox', { name: 'Name' })
}

test('a duplicate slug keeps the creation draft and a successful retry clears it', async () => {
  const action = jest.fn<Promise<{ error?: string }>, [FormData]>()
    .mockResolvedValueOnce({ error: 'That URL slug is already in use.' }).mockResolvedValueOnce({})
  const user = userEvent.setup()
  const name = editor(action, true)
  await user.type(name, 'Draft service')
  await user.click(screen.getByRole('button', { name: 'Create' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('That URL slug is already in use.')
  expect(name).toHaveValue('Draft service')
  expect(action.mock.calls[0][0].get('name')).toBe('Draft service')
  await user.click(screen.getByRole('button', { name: 'Create' }))
  await waitFor(() => expect(name).toHaveValue(''))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('an edit blocks repeated saves while pending and keeps the draft after an unexpected failure', async () => {
  let rejectSave!: (error: Error) => void
  const action = jest.fn(() => new Promise<{ error?: string }>((_, reject) => { rejectSave = reject }))
  const user = userEvent.setup()
  const name = editor(action)
  await user.clear(name)
  await user.type(name, 'Edited service')
  const form = name.closest('form')!
  fireEvent.submit(form)
  fireEvent.submit(form)
  expect(action).toHaveBeenCalledTimes(1)
  expect(name).toBeDisabled()
  await act(async () => rejectSave(new Error('Private server error')))
  expect(await screen.findByRole('alert')).toHaveTextContent('The service could not be saved. Try again.')
  expect(name).toHaveValue('Edited service')
  expect(name).toBeEnabled()
})
