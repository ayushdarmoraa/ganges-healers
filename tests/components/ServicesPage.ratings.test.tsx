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

test('catalog cards show actual average/count and a truthful unrated state in one batched query', async () => {
  render(await ServicesPage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByLabelText('3.5 out of 5 from 2 reviews')).toBeVisible()
  expect(screen.getByText('No reviews yet')).toBeVisible()
  expect(screen.queryByText('5.0')).not.toBeInTheDocument()
  expect(prisma.review.groupBy).toHaveBeenCalledTimes(1)
  expect(prisma.review.groupBy).toHaveBeenCalledWith({ by: ['serviceId'], where: { serviceId: { in: ['rated', 'new'] } }, _avg: { rating: true }, _count: { rating: true } })
})
