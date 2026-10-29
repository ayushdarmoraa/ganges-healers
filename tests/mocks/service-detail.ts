import type { Healer, Service } from '@prisma/client'

// Match the service page's selected data, including the newer reviews and tool queries.
const service = {
  id: 's1', name: 'Yoga Healing', slug: 'yoga-healing', description: 'desc',
  image: null, price: 499, duration: 60, category: 'Yoga', mode: 'BOTH',
  benefits: [], _count: { bookings: 0 },
} satisfies Pick<Service, 'id' | 'name' | 'slug' | 'description' | 'image' | 'price' | 'duration' | 'category' | 'mode' | 'benefits'> & { _count: { bookings: number } }

const healer = {
  id: 'h1', bio: '', experienceYears: 5, rating: 4.8, specializations: ['Yoga'],
  isVerified: true, availability: null, user: { name: 'Healer One', image: null },
  _count: { reviews: 0 },
} satisfies Pick<Healer, 'id' | 'bio' | 'experienceYears' | 'rating' | 'specializations' | 'isVerified' | 'availability'> & { user: { name: string; image: string | null }; _count: { reviews: number } }

jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: {
      findUnique: jest.fn(async ({ where }: { where: { slug: string } }) => where.slug === service.slug ? service : null),
    },
    healer: { findMany: jest.fn(async () => [healer]) },
    review: {
      findMany: jest.fn(async () => []),
      aggregate: jest.fn(async () => ({ _avg: { rating: null }, _count: { rating: 0 } })),
    },
    booking: { count: jest.fn(async () => 0) },
    product: { findMany: jest.fn(async () => []) },
  },
}))

// These parent-page tests exercise booking and breadcrumbs. Nested async server
// components need the Next server renderer, which the jsdom render does not provide.
jest.mock('@/components/features/services/RelatedServices', () => ({ __esModule: true, default: () => null }))
jest.mock('@/components/features/services/InternalLinks', () => ({ __esModule: true, default: () => null }))
