import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/bookings/[id]/review/route'

type SavedReview = { id: string; rating: number; comment: string | null; createdAt: Date }
type TestBooking = { id: string; userId: string; healerId: string; serviceId: string; status: string; scheduledAt: Date; durationMin: number; healer: { userId: string }; review: SavedReview | null }
let mockUserId: string | undefined
jest.mock('@/lib/auth', () => ({ auth: async () => mockUserId ? { user: { id: mockUserId } } : null }))
jest.mock('@/lib/prisma', () => {
  const tx = { $executeRaw: jest.fn(async () => 1), booking: { findFirst: jest.fn() }, review: { create: jest.fn(), aggregate: jest.fn() }, healer: { update: jest.fn() } }
  return { prisma: { ...tx, $transaction: jest.fn(async work => work(tx)) } }
})
type PromiseMocks<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R ? jest.Mock<Promise<Awaited<R>>, A> : PromiseMocks<T[K]> }
const db = prisma as unknown as PromiseMocks<Pick<typeof prisma, 'booking' | 'review' | 'healer' | '$transaction'>>
let booking: TestBooking
function submit(body: unknown = { rating: 4, comment: ' Thoughtful session. ' }, id = 'booking') {
  return POST(new Request('http://localhost/api/bookings/booking/review', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })
}
beforeEach(() => {
  jest.clearAllMocks()
  mockUserId = 'customer'
  booking = { id: 'booking', userId: 'customer', healerId: 'healer', serviceId: 'service', status: 'COMPLETED', scheduledAt: new Date(Date.now() - 7200000), durationMin: 60, healer: { userId: 'practitioner' }, review: null }
  db.booking.findFirst.mockImplementation(async args => args?.where?.id === booking.id && args?.where?.userId === booking.userId ? booking as never : null)
  db.review.create.mockImplementation(async ({ data }) => ({ id: 'review', rating: data.rating, comment: data.comment ?? null, createdAt: new Date('2026-11-05T12:00:00Z') }) as never)
  db.review.aggregate.mockResolvedValue({ _avg: { rating: 4.5 } } as never)
  db.healer.update.mockResolvedValue({} as never)
})

test('binds a new review to the owned completed booking and updates the healer rating atomically', async () => {
  const response = await submit()
  expect(response.status).toBe(201)
  expect(await response.json()).toMatchObject({ success: true, idempotent: false, data: { rating: 4, comment: 'Thoughtful session.' } })
  expect(db.review.create).toHaveBeenCalledWith(expect.objectContaining({ data: { bookingId: 'booking', userId: 'customer', serviceId: 'service', healerId: 'healer', rating: 4, comment: 'Thoughtful session.' } }))
  expect(db.healer.update).toHaveBeenCalledWith({ where: { id: 'healer' }, data: { rating: 4.5 } })
  expect(prisma.$executeRaw).toHaveBeenCalledWith(expect.anything(), 72102, 'healer')
})

test.each([undefined, ''])('requires a real signed-in customer ID (%s)', async userId => {
  mockUserId = userId
  expect((await submit()).status).toBe(401)
  expect(db.$transaction).not.toHaveBeenCalled()
})

test.each([0, 6, 1.5, '5', null])('rejects invalid rating %s before database access', async rating => {
  expect((await submit({ rating })).status).toBe(400)
  expect(db.$transaction).not.toHaveBeenCalled()
})

test('rejects oversized comments and client-supplied ownership fields', async () => {
  expect((await submit({ rating: 5, comment: 'x'.repeat(2001) })).status).toBe(400)
  expect((await submit({ rating: 5, healerId: 'somebody-else' })).status).toBe(400)
  expect(db.$transaction).not.toHaveBeenCalled()
})

test('malformed JSON returns a validation response without writing', async () => {
  const response = await POST(new Request('http://localhost/api/bookings/booking/review', { method: 'POST', body: '{' }), { params: Promise.resolve({ id: 'booking' }) })
  expect(response.status).toBe(400)
  expect(db.$transaction).not.toHaveBeenCalled()
})

test('another customer and a nonexistent booking have the same not-found response', async () => {
  mockUserId = 'stranger'
  const foreign = await submit()
  const missing = await submit({ rating: 4 }, 'missing')
  expect(foreign.status).toBe(404)
  expect(missing.status).toBe(404)
  expect(await foreign.json()).toEqual(await missing.json())
  expect(db.review.create).not.toHaveBeenCalled()
})

test.each(['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED', 'CANCELLED'])('rejects a %s booking', async status => {
  booking.status = status
  expect((await submit()).status).toBe(409)
  expect(db.review.create).not.toHaveBeenCalled()
})

test('a healer cannot review their own session', async () => {
  booking.healer.userId = 'customer'
  expect((await submit()).status).toBe(403)
  expect(db.review.create).not.toHaveBeenCalled()
})

test('a prematurely completed session cannot be reviewed before its scheduled end', async () => {
  booking.scheduledAt = new Date(Date.now() - 1800000)
  expect((await submit()).status).toBe(409)
  expect(db.review.create).not.toHaveBeenCalled()
})

test('identical delivery retries return the existing review without incrementing ratings again', async () => {
  booking.review = { id: 'previous', rating: 4, comment: 'Thoughtful session.', createdAt: new Date() }
  const response = await submit()
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ idempotent: true, data: { id: 'previous' } })
  expect(db.review.create).not.toHaveBeenCalled()
  expect(db.healer.update).not.toHaveBeenCalled()
})

test('a different second submission cannot replace an existing review', async () => {
  booking.review = { id: 'previous', rating: 2, comment: null, createdAt: new Date() }
  expect((await submit()).status).toBe(409)
  expect(db.review.create).not.toHaveBeenCalled()
})

test('blank optional comments become null and markup remains plain text', async () => {
  await submit({ rating: 5, comment: '   ' })
  expect(db.review.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ comment: null }) }))
  await submit({ rating: 4, comment: '<script>bad()</script>' })
  expect(db.review.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ comment: '<script>bad()</script>' }) }))
})

test('transaction failures return a safe error for retry', async () => {
  db.review.aggregate.mockRejectedValueOnce(new Error('private database details'))
  const response = await submit()
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ error: 'Could not save your review. Please try again.' })
})
