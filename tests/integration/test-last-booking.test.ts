/**
 * Integration tests for TEST_MODE-only endpoint GET /api/test/last-booking
 */
jest.setTimeout(20000)

jest.mock('@/lib/auth', () => {
  return {
    auth: async () => ({
      user: {
        id: process.env.TEST_USER_ID,
        role: 'USER',
        vip: false,
        freeSessionCredits: 0,
        email: 'test-user@example.com',
      }
    }),
  }
})

import { prisma } from '@/lib/prisma'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as LastBooking from '@/app/api/test/last-booking/route'
import * as BookingCollection from '@/app/api/bookings/route'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'

describe('GET /api/test/last-booking (TEST_MODE)', () => {
  let userId: string
  let service: { id: string } | null = null
  let healer: { id: string } | null = null

  beforeAll(async () => {
    const u = await prisma.user.create({ data: { email: `itest_last_${Date.now()}@ex.com`, password: 'hashed', role: 'USER', vip: false, freeSessionCredits: 0 } })
    userId = u.id
    process.env.TEST_USER_ID = userId

    service = await prisma.service.findFirst({ where: { isActive: true } })
    healer = await prisma.healer.findFirst()
    if (!service || !healer) throw new Error('seed missing service/healer for tests')

    // ensure wide availability on healer for test slots
    const wideOpen = {
      monday: { start: '10:00', end: '20:00' },
      tuesday: { start: '10:00', end: '20:00' },
      wednesday: { start: '10:00', end: '20:00' },
      thursday: { start: '10:00', end: '20:00' },
      friday: { start: '10:00', end: '20:00' },
      saturday: { start: '10:00', end: '20:00' },
      sunday: { start: '10:00', end: '20:00' },
    }
    await prisma.healer.update({ where: { id: healer.id }, data: { availability: wideOpen } })
  })

  afterAll(async () => {
    if (userId) {
      await prisma.payment.deleteMany({ where: { booking: { userId } } }).catch(() => {})
      await prisma.booking.deleteMany({ where: { userId } }).catch(() => {})
      await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    }
    await prisma.$disconnect()
  })

  test('returns 404 when TEST_MODE !== 1', async () => {
    process.env.TEST_MODE = '0'
    const req = makeNextRequest('http://localhost/api/test/last-booking', { method: 'GET' })
    const res = await LastBooking.GET!(req)
    const body = await readJSON(res)
    expect(res.status).toBe(404)
    expect(body?.success).toBe(false)
  })

  test('returns most recent booking when TEST_MODE=1 and authenticated', async () => {
    process.env.TEST_MODE = '1'
    // create a booking via handler
    const slot = clinicSlotInstant(clinicDate(new Date(Date.now() + 3 * 86400000)), '11:00')
    const postReq = makeNextRequest('http://localhost/api/bookings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer!.id, serviceId: service!.id, scheduledAt: new Date(slot).toISOString() })
    })
    const postRes = await BookingCollection.POST!(postReq)
    expect(postRes.status).toBe(201)

    // call the test endpoint
    const req = makeNextRequest('http://localhost/api/test/last-booking', { method: 'GET' })
    const res = await LastBooking.GET!(req)
    const body = await readJSON(res)
    expect(res.status).toBe(200)
    expect(body?.success).toBe(true)
    const data = body?.data ?? []
    expect(Array.isArray(data)).toBe(true)
    expect(data.length).toBeGreaterThanOrEqual(1)
    const b = data[0]
    expect(b).toHaveProperty('id')
    expect(b.userId).toBe(userId)
  })
})
