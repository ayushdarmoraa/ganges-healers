/**
 * Integration tests for Booking APIs
 * Covers:    const createdUser = await prisma.user.create({
      data: { email: `itest_${Dat      const res = await CollectionHandlers.POST!(req)
      const body = await readJ    const del2Res = await IdHandlers.DELETE!(del2Req, { params: Promise.resolve({ id: id2 }) })
    const body2 = await readJSON(del2Res)
    expect(del2Res.status).toBeGreaterThanOrEqual(400)
    expect((body2?.error || '').toLowerCase()).toMatch(/24\s*hour|cannot\s*cancel/)res)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect((body?.error || '').toLowerCase()).toMatch(/(past|future|30|min|align|invalid)/)w()}@ex.com`, password: 'hashed', role: 'USER', vip: false, freeSessionCredits: 0 }
    })
    user = { id: createdUser.id, email: createdUser.email }
    process.env.TEST_USER_ID = user.id

    service = await prisma.service.findFirst({ where: { isActive: true } })
    healer = await prisma.healer.findFirst()
    if (!service || !healer) throw new Error('Seed missing service/healer for tests')

    // Open up availability 10:00–20:00 for all days so slots are always valid
    const wideOpen = {
      monday: { start: '10:00', end: '20:00' },
      tuesday: { start: '10:00', end: '20:00' },
      wednesday: { start: '10:00', end: '20:00' },
      thursday: { start: '10:00', end: '20:00' },
      friday: { start: '10:00', end: '20:00' },
      saturday: { start: '10:00', end: '20:00' },
      sunday: { start: '10:00', end: '20:00' },
    }
    await prisma.healer.update({
      where: { id: healer.id },
      data: { availability: wideOpen },
    })> conflict/past/misaligned, reschedule (>24h / <24h), cancel (>24h / <24h)
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
import { addHours, addDays, setHours, setMinutes } from 'date-fns'
import * as BookingCollection from '@/app/api/bookings/route'
import * as BookingById from '@/app/api/bookings/[id]/route'

function iso(d: Date) { return new Date(d).toISOString() }

// NOTE: Handlers depend on auth() which reads session; for now we bypass by monkey-patching auth to return our test user session


type BookingHandlerModule = {
  POST?: (req: Request) => Promise<Response>
  GET?: (req: Request) => Promise<Response>
}
type BookingIdHandlerModule = {
  PUT?: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
  DELETE?: (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
}

const CollectionHandlers = BookingCollection as unknown as BookingHandlerModule
const IdHandlers = BookingById as unknown as BookingIdHandlerModule

interface User { id: string; email: string }
interface Healer { id: string }
interface Service { id: string }

describe('API /api/bookings integration', () => {
  let user: User
  let healer: Healer | null
  let service: Service | null

  beforeAll(async () => {
    // Create a fresh user
    const createdUser = await prisma.user.create({
      data: { email: `itest_${Date.now()}@ex.com`, password: 'hashed', role: 'USER', vip: false, freeSessionCredits: 0 }
    })
    user = { id: createdUser.id, email: createdUser.email }
    process.env.TEST_USER_ID = user.id

    service = await prisma.service.findFirst({ where: { isActive: true } })
    healer = await prisma.healer.findFirst()
    if (!service || !healer) throw new Error('Seed missing service/healer for tests')

    // Open up availability 10:00–20:00 for all days so slots are always valid
    const wideOpen = {
      monday: { start: '10:00', end: '20:00' },
      tuesday: { start: '10:00', end: '20:00' },
      wednesday: { start: '10:00', end: '20:00' },
      thursday: { start: '10:00', end: '20:00' },
      friday: { start: '10:00', end: '20:00' },
      saturday: { start: '10:00', end: '20:00' },
      sunday: { start: '10:00', end: '20:00' },
    }
    await prisma.healer.update({
      where: { id: healer.id },
      data: { availability: wideOpen },
    })
  })

  afterAll(async () => {
    if (user?.id) {
      await prisma.payment.deleteMany({ where: { booking: { userId: user.id } } })
      await prisma.booking.deleteMany({ where: { userId: user.id } })
      await prisma.user.delete({ where: { id: user.id } }).catch(()=>{})
    }
    await prisma.$disconnect()
  })

  test('POST /api/bookings creates PENDING booking on valid future slot', async () => {
    const base = addDays(new Date(), 2)
    const slot = setMinutes(setHours(base, 11), 0)

    const req = makeNextRequest('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer!.id, serviceId: service!.id, scheduledAt: iso(slot) })
    })
    const res = await CollectionHandlers.POST!(req)
    expect(res.status).toBe(201)
    const body = await readJSON(res)
    const booking = body?.booking ?? body?.data ?? body
    expect(booking?.status).toBe('PENDING')
    expect(booking?.userId).toBe(user.id)
  })

  test('POST /api/bookings rejects conflicting slot', async () => {
    const base = addDays(new Date(), 3)
    const slot = setMinutes(setHours(base, 12), 0)
    const first = makeNextRequest('http://localhost/api/bookings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer!.id, serviceId: service!.id, scheduledAt: iso(slot) })
    })
  const r1 = await CollectionHandlers.POST!(first)
    expect(r1.status).toBe(201)
    const dup = makeNextRequest('http://localhost/api/bookings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer!.id, serviceId: service!.id, scheduledAt: iso(slot) })
    })
  const r2 = await CollectionHandlers.POST!(dup)
    const b2 = await readJSON(r2)
    expect(r2.status).toBeGreaterThanOrEqual(400)
    expect((b2?.error || '').toLowerCase()).toMatch(/(conflict|booked|available)/)
  })

  test('POST /api/bookings rejects past and misaligned', async () => {
    const past = addHours(new Date(), -1)
    const misaligned = setMinutes(addDays(new Date(), 2), 10)
    for (const when of [past, misaligned]) {
      const req = makeNextRequest('http://localhost/api/bookings', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ healerId: healer!.id, serviceId: service!.id, scheduledAt: iso(when) })
      })
  const res = await CollectionHandlers.POST!(req)
      const body = await readJSON(res)
      expect(res.status).toBeGreaterThanOrEqual(400)
      expect((body?.error || '').toLowerCase()).toMatch(/(past|future|30|min|align|invalid)/)
    }
  })

  test('PUT /api/bookings/[id] reschedules when >24h, rejects <24h', async () => {
    // Use unique time for reschedule test to avoid conflicts
    const t1 = setMinutes(setHours(addDays(new Date(), 5), 11), 30)
    const cReq = makeNextRequest('http://localhost/api/bookings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer!.id, serviceId: service!.id, scheduledAt: iso(t1) })
    })
    const cRes = await CollectionHandlers.POST!(cReq)
    const cBody = await readJSON(cRes)
    const booking = cBody?.data ?? cBody?.booking ?? cBody
    const id = booking?.id
    expect(id).toBeTruthy()

    const t2 = setMinutes(setHours(addDays(t1, 1), 14), 0)
    const rReq = makeNextRequest(`http://localhost/api/bookings/${id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledAt: iso(t2) })
    })
    const rRes = await IdHandlers.PUT!(rReq, { params: Promise.resolve({ id }) })
    expect(rRes.status).toBeLessThan(300)

    const near = addHours(new Date(), 1) // 1 hour ahead - definitely less than 24h
    const nearAligned = setMinutes(setHours(near, 12), 0) // Force to 12:00 PM to be within healer availability
    const nearReq = makeNextRequest(`http://localhost/api/bookings/${id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledAt: iso(nearAligned) })
    })
  const nearRes = await IdHandlers.PUT!(nearReq, { params: Promise.resolve({ id }) })
    const nearBody = await readJSON(nearRes)
    expect(nearRes.status).toBeGreaterThanOrEqual(400)
    expect((nearBody?.error || '').toLowerCase()).toMatch(/24\s*hour|cannot\s*reschedule/)
  })

  test('DELETE /api/bookings/[id] cancels >24h, rejects <24h', async () => {
    // Use unique time for cancel test to avoid conflicts  
    const future = setMinutes(setHours(addDays(new Date(), 6), 16), 30)
    const cReq = makeNextRequest('http://localhost/api/bookings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer!.id, serviceId: service!.id, scheduledAt: iso(future) })
    })
    const cRes = await CollectionHandlers.POST!(cReq)
    const cBody = await readJSON(cRes)
    const booking = cBody?.booking ?? cBody?.data ?? cBody
    const id = booking?.id

    const delReq = makeNextRequest(`http://localhost/api/bookings/${id}`, { method: 'DELETE' })
  const delRes = await IdHandlers.DELETE!(delReq, { params: Promise.resolve({ id }) })
    expect(delRes.status).toBeLessThan(300)

    const soon = addHours(new Date(), 1) // 1 hour ahead - definitely less than 24h
    const soonAligned = setMinutes(setHours(soon, 13), 0) // Force to 1:00 PM to be within healer availability
    const c2Req = makeNextRequest('http://localhost/api/bookings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer!.id, serviceId: service!.id, scheduledAt: iso(soonAligned) })
    })
    const c2Res = await CollectionHandlers.POST!(c2Req)
    const b2 = await readJSON(c2Res)
    const booking2 = b2?.booking ?? b2?.data ?? b2
    const id2 = booking2?.id

    const del2Req = makeNextRequest(`http://localhost/api/bookings/${id2}`, { method: 'DELETE' })
  const del2Res = await IdHandlers.DELETE!(del2Req, { params: Promise.resolve({ id: id2 }) })
    const body2 = await readJSON(del2Res)
    expect(del2Res.status).toBeGreaterThanOrEqual(400)
    expect((body2?.error || '').toLowerCase()).toMatch(/24\s*hour|cannot\s*cancel/)
  })
})
