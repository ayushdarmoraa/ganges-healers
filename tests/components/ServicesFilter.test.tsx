import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ServicesFilter from '@/components/services/ServicesFilter'
import HealingPathSelector from '@/components/home/HealingPathSelector'

const mockPush = jest.fn()
let mockParams = new URLSearchParams()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), useSearchParams: () => mockParams }))
beforeEach(() => { mockPush.mockClear(); mockParams = new URLSearchParams() })

test('categories come from the active catalog instead of an unrelated hardcoded taxonomy', () => {
  render(<ServicesFilter categories={['Energy Healing', 'Movement & Body', 'Therapy']} />)
  expect(screen.getByRole('option', { name: 'Energy Healing' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Therapy' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Mind Therapy' })).not.toBeInTheDocument()
})

test('legacy searches, actual categories and zero-price filters round-trip through navigation', async () => {
  mockParams = new URLSearchParams({ q: 'hypnotherapy', category: 'Therapy', minPrice: '0' })
  const user = userEvent.setup()
  render(<ServicesFilter categories={['Therapy']} />)
  expect(screen.getByLabelText('Search', { exact: true })).toHaveValue('hypnotherapy')
  expect(screen.getByLabelText('Category')).toHaveValue('Therapy')
  expect(screen.getByLabelText('Minimum price (₹)')).toHaveValue(0)
  await user.click(screen.getByRole('button', { name: 'Apply Filters' }))
  const destination = new URL(mockPush.mock.calls[0][0], 'https://example.test')
  expect(Object.fromEntries(destination.searchParams)).toEqual({ search: 'hypnotherapy', category: 'Therapy', minPrice: '0' })
  await user.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(mockPush).toHaveBeenLastCalledWith('/services')
  expect(screen.getByLabelText('Search', { exact: true })).toHaveValue('')
})

test('a legacy unavailable category is shown truthfully and can be cleared', async () => {
  mockParams = new URLSearchParams({ category: 'HYPNOTHERAPY' })
  const user = userEvent.setup()
  render(<ServicesFilter categories={['Therapy']} />)
  expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('HYPNOTHERAPY')
  expect(screen.getByRole('option', { name: 'HYPNOTHERAPY (unavailable)' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('')
})

test('the current rating threshold can be changed and cleared with the other filters', async () => {
  mockParams = new URLSearchParams({ search: 'yoga', minRating: '4.5' })
  const user = userEvent.setup()
  render(<ServicesFilter categories={[]} minimumRating={4.5} />)
  const rating = screen.getByLabelText('Minimum rating (out of 5)')
  expect(rating).toHaveValue(4.5)
  await user.clear(rating)
  await user.type(rating, '4{Enter}')
  expect(mockPush).toHaveBeenLastCalledWith('/services?minRating=4&search=yoga')
  await user.click(screen.getByRole('button', { name: 'Clear all' }))
  expect(rating).toHaveValue(null)
  expect(mockPush).toHaveBeenLastCalledWith('/services')
})

test('home service discovery paths use supported search fields rather than nonexistent categories', () => {
  render(<HealingPathSelector />)
  for (const label of ['Anxiety & Stress', 'Emotional Healing', 'Spiritual Growth', 'Past Trauma']) {
    const destination = new URL(screen.getByRole('link', { name: label }).getAttribute('href')!, 'https://example.test')
    expect(destination.pathname).toBe('/services')
    expect(destination.searchParams.get('search')).toBeTruthy()
    expect(destination.searchParams.has('category')).toBe(false)
  }
})
