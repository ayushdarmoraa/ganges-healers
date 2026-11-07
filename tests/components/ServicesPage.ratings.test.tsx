import { render, screen } from '@testing-library/react'
import ServicesPage from '@/app/services/page'
import { prisma } from '@/lib/prisma'

jest.mock('@/components/services/ServicesFilter', () => ({ __esModule: true, default: () => null }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  service: { findMany: jest.fn(async () => [
    { id: 'rated', slug: 'yoga', name: 'Yoga', description: 'A session', category: 'Yoga', price: 100, duration: 60, image: null, _count: { bookings: 5 } },
    { id: 'new', slug: 'meditation', name: 'Meditation', description: 'A session', category: 'Meditation', price: 200, duration: 30, image: null, _count: { bookings: 0 } },
  ]) },
  review: { groupBy: jest.fn(async () => [{ serviceId: 'rated', _avg: { rating: 3.5 }, _count: { rating: 2 } }]) },
} }))

beforeEach(() => jest.clearAllMocks())

test('catalog cards show actual average/count and a truthful unrated state in one batched query', async () => {
  render(await ServicesPage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByLabelText('3.5 out of 5 from 2 reviews')).toBeVisible()
  expect(screen.getByText('No reviews yet')).toBeVisible()
  expect(screen.queryByText('5.0')).not.toBeInTheDocument()
  expect(prisma.review.groupBy).toHaveBeenCalledTimes(1)
  expect(prisma.review.groupBy).toHaveBeenCalledWith({ by: ['serviceId'], where: { serviceId: { in: ['rated', 'new'] } }, _avg: { rating: true }, _count: { rating: true } })
  expect(prisma.service.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } })
})

test('malformed prices and repeated search values never reach Prisma as NaN, infinity or comma-joined terms', async () => {
  await ServicesPage({ searchParams: Promise.resolve({ minPrice: 'NaN', maxPrice: 'Infinity', search: ['first', 'second'], category: ['one', 'two'] }) })
  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true }, select: expect.objectContaining({ name: true }) }))
})

test('valid search and category filters retain a zero minimum price', async () => {
  await ServicesPage({ searchParams: Promise.resolve({ minPrice: '0', maxPrice: '9000', search: 'hypnotherapy', category: 'Therapy' }) })
  expect(prisma.service.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true, category: 'Therapy', price: { gte: 0, lte: 9000 }, OR: [
    { name: { contains: 'hypnotherapy', mode: 'insensitive' } }, { description: { contains: 'hypnotherapy', mode: 'insensitive' } },
  ] } }))
})

test('a minimum rating matches the actual review average and excludes unrated services', async () => {
  render(await ServicesPage({ searchParams: Promise.resolve({ minRating: '3.5' }) }))
  expect(screen.getByRole('heading', { name: 'Yoga' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: 'Meditation' })).not.toBeInTheDocument()
  expect(prisma.review.groupBy).toHaveBeenCalledTimes(1)
})

test('a higher threshold shows the clearable empty state', async () => {
  render(await ServicesPage({ searchParams: Promise.resolve({ minRating: '3.6' }) }))
  expect(screen.getByText('No matching services')).toBeVisible()
  expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute('href', '/services')
})

test.each(['Infinity', '0', '5.1', '4.51', ['4', '5']].map(minRating => ({ minRating })))('ignores malformed or repeated ratings (%j)', async ({ minRating }) => {
  render(await ServicesPage({ searchParams: Promise.resolve({ minRating }) }))
  expect(screen.getByRole('heading', { name: 'Meditation' })).toBeVisible()
})
