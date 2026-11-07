import { render, screen } from '@testing-library/react'
import { prisma } from '@/lib/prisma'
import FeaturedHealers from '@/components/home/FeaturedHealers'

jest.mock('@/lib/prisma', () => ({ prisma: {
  healer: { findMany: jest.fn(async () => [
    { id: 'rated', rating: 4.9, experienceYears: 5, specializations: ['Yoga'], user: { name: 'Reviewed Practitioner', image: null } },
    { id: 'new', rating: 4.9, experienceYears: 3, specializations: ['Reiki'], user: { name: 'New Practitioner', image: null } },
  ]) },
  review: { groupBy: jest.fn(async () => [{ healerId: 'rated', _avg: { rating: 3.5 }, _count: { rating: 2 } }]) },
} }))

test('featured healers use actual review averages and show an unrated state without invented stars', async () => {
  render(await FeaturedHealers())
  expect(screen.getByLabelText('3.5 out of 5 from 2 reviews')).toBeVisible()
  expect(screen.getByText('No reviews yet')).toBeVisible()
  expect(screen.queryByText('4.9')).not.toBeInTheDocument()
  expect(prisma.review.groupBy).toHaveBeenCalledWith({ by: ['healerId'], where: { healerId: { in: ['rated', 'new'] } }, _avg: { rating: true }, _count: { rating: true } })
  expect(prisma.healer.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { isActive: true, isVerified: true }, take: 4,
    orderBy: [{ reviews: { _count: 'desc' } }, { id: 'asc' }],
  }))
})

test('an empty featured section does not run an unbounded rating query', async () => {
  jest.mocked(prisma.healer.findMany).mockResolvedValueOnce([])
  jest.mocked(prisma.review.groupBy).mockClear()
  expect(await FeaturedHealers()).toBeNull()
  expect(prisma.review.groupBy).not.toHaveBeenCalled()
})
