import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET } from '@/app/api/services/[id]/route'
import { getHealerBySlug, getHealerReviewSummaries, listHealers } from '@/lib/healers/queries'
import { requireAdmin } from '@/lib/rbac'

jest.mock('@/lib/rbac', () => ({ requireAdmin: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  service: { findUnique: jest.fn(), findMany: jest.fn(async () => []) },
  review: { aggregate: jest.fn(), groupBy: jest.fn(async () => []) },
  healer: { findUnique: jest.fn(), findMany: jest.fn(async () => []) },
} }))
const getService = jest.mocked(prisma.service.findUnique)
const aggregate = jest.mocked(prisma.review.aggregate)
function request() {
  return GET(new NextRequest('http://localhost/api/services/service'), { params: Promise.resolve({ id: 'service' }) })
}
function fixture() {
  const healer = { id: 'healer', userId: 'private-practitioner-id', bio: 'Public bio', experienceYears: 8, rating: 4.9,
    specializations: ['Yoga'], isVerified: true, availability: { monday: 'private schedule' },
    user: { name: 'Public Practitioner', image: '/practitioner.jpg', id: 'private-practitioner-id', email: 'private-practitioner@example.test', phone: 'private-phone', password: 'private-hash' } }
  return { id: 'service', name: 'Yoga Therapy', slug: 'yoga-therapy', description: 'Public description', tagline: null,
    category: 'Yoga', price: 500, duration: 60, image: null, mode: 'BOTH', benefits: ['Relaxation'],
    isActive: true, popularity: 1, createdAt: new Date('2026-01-01Z'), updatedAt: new Date('2026-01-01Z'),
    internalUnexpectedField: 'do-not-export', _count: { bookings: 2, internal: 'do-not-export' },
    bookings: [{ id: 'private-booking-id', userId: 'private-customer-id', scheduledAt: new Date('2026-02-01Z'),
      meetingLink: 'https://example.test/private-meeting', pricePaise: 12345,
      payment: { gatewayPaymentId: 'private-payment-id' }, healer }],
  }
}
beforeEach(() => {
  jest.clearAllMocks()
  getService.mockResolvedValue(fixture() as never)
  aggregate.mockResolvedValue({ _avg: { rating: 2.5 }, _count: { rating: 3 } } as never)
  jest.mocked(prisma.healer.findUnique).mockResolvedValue(null)
  jest.mocked(prisma.review.groupBy).mockResolvedValue([])
  jest.mocked(prisma.healer.findMany).mockResolvedValue([])
})

test('anonymous service detail retains its envelope and public catalog/practitioner fields', async () => {
  const response = await request()
  const body = await response.json()
  expect(response.status).toBe(200)
  expect(body).toMatchObject({ success: true, data: { id: 'service', price: 500, totalBookings: 2, averageRating: 2.5, totalReviews: 3,
    healers: [{ id: 'healer', bio: 'Public bio', user: { name: 'Public Practitioner', image: '/practitioner.jpg' } }],
    bookings: [{ healer: { id: 'healer' } }], _count: { bookings: 2 },
  } })
  expect(requireAdmin).not.toHaveBeenCalled()
})

test('public response never spreads booking, payment, private account or unexpected ORM fields', async () => {
  const body = await (await request()).json()
  const forbidden = new Set(['userId', 'healerId', 'serviceId', 'bookingId', 'scheduledAt', 'meetingLink', 'pricePaise', 'payment', 'gatewayPaymentId', 'email', 'phone', 'password', 'availability', 'internalUnexpectedField', 'internal'])
  function check(value: unknown) {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      expect(forbidden.has(key)).toBe(false)
      check(child)
    }
  }
  check(body)
  expect(JSON.stringify(body)).not.toMatch(/private-|do-not-export/)
})

test('database selection does not load customer appointments or account secrets', async () => {
  await request()
  expect(getService).toHaveBeenCalledWith(expect.objectContaining({
    select: expect.objectContaining({ bookings: { where: { status: 'COMPLETED', healer: { isActive: true } },
      distinct: ['healerId'], select: { healer: { select: {
        id: true, bio: true, experienceYears: true, rating: true, specializations: true, isVerified: true,
        user: { select: { name: true, image: true } },
      } } },
    } }),
  }))
  expect(aggregate).toHaveBeenCalledWith({ where: { serviceId: 'service' }, _avg: { rating: true }, _count: { rating: true } })
})

test('duplicate practitioner rows remain one public summary', async () => {
  const row = fixture()
  row.bookings.push({ ...row.bookings[0], id: 'second-private-booking' })
  getService.mockResolvedValue(row as never)
  const body = await (await request()).json()
  expect(body.data.healers).toHaveLength(1)
  expect(body.data.bookings).toHaveLength(1)
})

test('an unrated service retains numeric zero and reports no reviews', async () => {
  aggregate.mockResolvedValue({ _avg: { rating: null }, _count: { rating: 0 } } as never)
  expect((await (await request()).json()).data).toMatchObject({ averageRating: 0, totalReviews: 0 })
})

test.each([null, { ...fixture(), isActive: false }])('missing and inactive services are unavailable without further reads', async row => {
  getService.mockResolvedValue(row as never)
  const response = await request()
  expect(response.status).toBe(404)
  expect(await response.json()).toEqual({ error: 'Service not found' })
  expect(aggregate).not.toHaveBeenCalled()
})

test('database failures preserve the public error response', async () => {
  getService.mockRejectedValueOnce(new Error('private-internal-error'))
  const response = await request()
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Failed to fetch service' })
})

test('public healer detail only queries active practitioners', async () => {
  await expect(getHealerBySlug('inactive')).resolves.toBeNull()
  expect(prisma.healer.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'inactive', isActive: true } }))
  expect(prisma.service.findMany).not.toHaveBeenCalled()
})

test('public healer discovery only links active services', async () => {
  await listHealers()
  expect(prisma.service.findMany).toHaveBeenCalledWith({ where: { isActive: true }, select: { slug: true, name: true } })
})

test('empty healer results do not query ratings', async () => {
  await expect(getHealerReviewSummaries([])).resolves.toEqual(new Map())
  expect(prisma.review.groupBy).not.toHaveBeenCalled()
})

test('healer summaries use one bounded aggregate and deduplicate selected IDs', async () => {
  jest.mocked(prisma.review.groupBy).mockResolvedValue([{ healerId: 'rated', _avg: { rating: 3.5 }, _count: { rating: 2 } }] as never)
  expect(await getHealerReviewSummaries(['rated', 'new', 'rated'])).toEqual(new Map([['rated', { ratingAvg: 3.5, reviewCount: 2 }]]))
  expect(prisma.review.groupBy).toHaveBeenCalledWith({ by: ['healerId'], where: { healerId: { in: ['rated', 'new'] } }, _avg: { rating: true }, _count: { rating: true } })
})

test('healer discovery ignores old stored ratings without accepted reviews', async () => {
  jest.mocked(prisma.healer.findMany).mockResolvedValue([{ id: 'new', rating: 4.9, specializations: [], user: { name: 'New Practitioner' } }] as never)
  expect((await listHealers()).items).toMatchObject([{ id: 'new', ratingAvg: 0, reviewCount: 0 }])
})

test('healer profile uses actual review values rather than a stored rating', async () => {
  jest.mocked(prisma.healer.findUnique).mockResolvedValue({ id: 'rated', rating: 4.9, specializations: [], user: { name: 'Reviewed Practitioner' } } as never)
  jest.mocked(prisma.review.groupBy).mockResolvedValue([{ healerId: 'rated', _avg: { rating: 3.5 }, _count: { rating: 2 } }] as never)
  expect(await getHealerBySlug('rated')).toMatchObject({ ratingAvg: 3.5, reviewCount: 2 })
})

test.each([
  { stored: [' RYT-200 ', { name: 'Reiki Master', year: 2015 }, { name: 'RYT-200' }], expected: ['RYT-200', 'Reiki Master'] },
  { stored: [null, 123, { privateId: 'not-public' }, { name: 7 }, { name: ' ' }, ['nested']], expected: [] },
  { stored: null, expected: [] },
])('public certification labels support saved names without rendering arbitrary objects', async ({ stored, expected }) => {
  jest.mocked(prisma.healer.findUnique).mockResolvedValue({ id: 'healer', specializations: [], certifications: stored, user: { name: 'Practitioner' } } as never)
  expect((await getHealerBySlug('healer'))?.certifications).toEqual(expected)
})
