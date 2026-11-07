import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/bookings/[id]/review/route'
import { getHealerBySlug, getHealerReviewSummaries } from '@/lib/healers/queries'

let mockActorId = ''
jest.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: mockActorId } }) }))
let userId: string
let healerUserId: string
let healerId: string
let serviceId: string
function send(id: string, rating = 4, comment = 'A clear and useful session.') {
  return POST(new Request(`http://localhost/api/bookings/${id}/review`, { method: 'POST', body: JSON.stringify({ rating, comment }) }), { params: Promise.resolve({ id }) })
}
async function completedBooking() {
  return prisma.booking.create({ data: {
    userId, healerId, serviceId, scheduledAt: new Date(Date.now() - 7200000), durationMin: 60, status: 'COMPLETED', pricePaise: 10000,
  } })
}
beforeAll(async () => {
  const token = randomUUID()
  userId = (await prisma.user.create({ data: { email: `reviews-${token}@example.test`, name: 'Review Customer' } })).id
  healerUserId = (await prisma.user.create({ data: { email: `review-healer-${token}@example.test`, role: 'HEALER' } })).id
  healerId = (await prisma.healer.create({ data: { userId: healerUserId } })).id
  serviceId = (await prisma.service.create({ data: { slug: `review-service-${token}`, name: 'Review Service', description: 'Review test', category: 'Test', price: 100, duration: 60 } })).id
})
beforeEach(async () => {
  mockActorId = userId
  await prisma.booking.deleteMany({ where: { serviceId } })
  await prisma.healer.update({ where: { id: healerId }, data: { rating: 0 } })
})
afterAll(async () => {
  try {
    if (userId) await prisma.user.delete({ where: { id: userId } })
    if (healerUserId) await prisma.user.delete({ where: { id: healerUserId } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('concurrent identical reviews create one record and return an idempotent replay', async () => {
  const booking = await completedBooking()
  const responses = await Promise.all([send(booking.id), send(booking.id)])
  expect(responses.map(response => response.status).sort()).toEqual([200, 201])
  expect(await prisma.review.count({ where: { bookingId: booking.id } })).toBe(1)
  expect(await prisma.review.findUnique({ where: { bookingId: booking.id } })).toMatchObject({ userId, serviceId, healerId, rating: 4 })
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).rating).toBe(4)
})

test('concurrent conflicting submissions cannot replace the accepted review', async () => {
  const booking = await completedBooking()
  const responses = await Promise.all([send(booking.id, 1), send(booking.id, 5)])
  expect(responses.map(response => response.status).sort()).toEqual([201, 409])
  expect(await prisma.review.count({ where: { bookingId: booking.id } })).toBe(1)
  const saved = await prisma.review.findUniqueOrThrow({ where: { bookingId: booking.id } })
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).rating).toBe(saved.rating)
})

test('concurrent reviews of different sessions update the actual healer average without a lost write', async () => {
  const [first, second] = await Promise.all([completedBooking(), completedBooking()])
  expect((await Promise.all([send(first.id, 2), send(second.id, 5)])).map(response => response.status)).toEqual([201, 201])
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).rating).toBe(3.5)
  const aggregate = await prisma.review.aggregate({ where: { serviceId }, _avg: { rating: true }, _count: { rating: true } })
  expect(aggregate).toMatchObject({ _avg: { rating: 3.5 }, _count: { rating: 2 } })
})

test('foreign ownership, cancelled sessions and sessions not yet ended cannot receive reviews', async () => {
  const booking = await completedBooking()
  mockActorId = healerUserId
  expect((await send(booking.id)).status).toBe(404)
  mockActorId = userId
  await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } })
  expect((await send(booking.id)).status).toBe(409)
  await prisma.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED', scheduledAt: new Date(Date.now() - 1800000) } })
  expect((await send(booking.id)).status).toBe(409)
  expect(await prisma.review.count({ where: { bookingId: booking.id } })).toBe(0)
})

test('public practitioner ratings ignore stale stored values and count accepted session reviews', async () => {
  await prisma.healer.update({ where: { id: healerId }, data: { rating: 4.9 } })
  expect(await getHealerBySlug(healerId)).toMatchObject({ ratingAvg: 0, reviewCount: 0 })
  const [first, second] = await Promise.all([completedBooking(), completedBooking()])
  expect((await send(first.id, 2)).status).toBe(201)
  expect((await send(second.id, 5)).status).toBe(201)
  await prisma.healer.update({ where: { id: healerId }, data: { rating: 4.9 } })
  expect((await getHealerReviewSummaries([healerId])).get(healerId)).toEqual({ ratingAvg: 3.5, reviewCount: 2 })
  expect(await getHealerBySlug(healerId)).toMatchObject({ ratingAvg: 3.5, reviewCount: 2 })
})
