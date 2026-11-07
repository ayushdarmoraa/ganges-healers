import { render, screen } from '@testing-library/react'
import SocialProofSection from '@/components/home/FeaturesSection'
import VIPMembershipSection from '@/components/home/VIPMembershipSection'
import StorePage from '@/app/store/page'

jest.mock('@/lib/prisma', () => ({ prisma: {
  healer: { count: jest.fn() }, service: { count: jest.fn() }, audioTrack: { count: jest.fn() },
  communityPost: { count: jest.fn() }, membershipPlan: { findMany: jest.fn() },
  productCategory: { findMany: jest.fn() }, product: { findMany: jest.fn() },
} }))
jest.mock('@/lib/store/queries', () => ({ listProducts: jest.fn(async () => ({ items: [], nextCursor: null })) }))

const db = jest.requireMock<{ prisma: {
  healer: { count: jest.Mock }; service: { count: jest.Mock }; audioTrack: { count: jest.Mock };
  communityPost: { count: jest.Mock }; membershipPlan: { findMany: jest.Mock };
  productCategory: { findMany: jest.Mock }; product: { findMany: jest.Mock };
} }>('@/lib/prisma').prisma

beforeEach(() => {
  jest.clearAllMocks()
  for (const model of [db.healer, db.service, db.audioTrack, db.communityPost]) model.count.mockResolvedValue(0)
  db.membershipPlan.findMany.mockResolvedValue([])
  db.productCategory.findMany.mockResolvedValue([])
  db.product.findMany.mockResolvedValue([])
})

test('empty catalogues show actual zero counts without fabricated community claims', async () => {
  render(await SocialProofSection())
  expect(screen.getAllByText('0', { exact: true })).toHaveLength(4)
  expect(screen.queryByText(/thousands|10\+|20\+|50\+|100\+/)).not.toBeInTheDocument()
})

test('community stats preserve the verified-healer and visible-post filters', async () => {
  db.healer.count.mockResolvedValue(5)
  db.service.count.mockResolvedValue(7)
  render(await SocialProofSection())
  expect(screen.getByText('5', { exact: true })).toBeVisible()
  expect(screen.getByText('7', { exact: true })).toBeVisible()
  expect(screen.getAllByText('0', { exact: true })).toHaveLength(2)
  expect(db.healer.count).toHaveBeenCalledWith({ where: { isActive: true, isVerified: true } })
  expect(db.communityPost.count).toHaveBeenCalledWith({ where: { deletedAt: null } })
})

test('membership cards use canonical plans and display configured benefits', async () => {
  const plans = [
    { id: 'monthly', slug: 'vip-monthly', title: 'VIP Monthly', pricePaise: 19900, interval: 'MONTHLY', benefits: { freeSessions: 2, priorityBooking: true, discountPct: 10 } },
    { id: 'yearly', slug: 'vip-yearly', title: 'VIP Yearly', pricePaise: 199000, interval: 'YEARLY', benefits: ['24 free sessions'] },
    { id: 'legacy', slug: 'yearly', title: 'VIP Yearly', pricePaise: 199000, interval: 'YEARLY', benefits: [] },
  ]
  db.membershipPlan.findMany.mockImplementation(({ where }: { where: { slug: { in: string[] } } }) =>
    Promise.resolve(plans.filter(plan => where.slug.in.includes(plan.slug))))
  render(await VIPMembershipSection())
  expect(screen.getAllByText('VIP Yearly', { exact: true })).toHaveLength(1)
  expect(screen.getAllByRole('link', { name: 'Get Started' })).toHaveLength(2)
  expect(screen.getByText('2 free sessions')).toBeVisible()
  expect(screen.getByText('24 free sessions')).toBeVisible()
  expect(screen.getByText('Priority booking')).toBeVisible()
  expect(screen.getByText('10% discount')).toBeVisible()
})

test('the store shows practice guidance instead of unsourced customer quotations', async () => {
  render(await StorePage({ searchParams: Promise.resolve({}) }))
  expect(screen.getByRole('heading', { name: 'Choose Tools for Your Practice' })).toBeVisible()
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.queryByRole('blockquote')).not.toBeInTheDocument()
  expect(screen.queryByText(/Priya S\.|Rahul K\.|Meera D\./)).not.toBeInTheDocument()
  expect(screen.getByText('No products found')).toBeVisible()
})
