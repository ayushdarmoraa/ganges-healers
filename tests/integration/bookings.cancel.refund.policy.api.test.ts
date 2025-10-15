/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'

// In-memory Prisma mock for this integration test (no real DB)
type AnyObj = Record<string, any>
const db = {
  users: [] as AnyObj[],
  healers: [] as AnyObj[],
  services: [] as AnyObj[],
  bookings: [] as AnyObj[],
  payments: [] as AnyObj[],
  refunds: [] as AnyObj[],
}
const cuid = () => 'id_' + Math.random().toString(36).slice(2)
const prismaMock = {
  user: {
    create: async ({ data }: { data: AnyObj }) => {
      const rec = { id: cuid(), createdAt: new Date(), updatedAt: new Date(), ...data }
      db.users.push(rec)
      return rec
    },
  },
  healer: {
    create: async ({ data }: { data: AnyObj }) => {
      const rec = { id: cuid(), createdAt: new Date(), updatedAt: new Date(), ...data }
      db.healers.push(rec)
      return rec
    },
  },
  service: {
    create: async ({ data }: { data: AnyObj }) => {
      const rec = { id: cuid(), createdAt: new Date(), updatedAt: new Date(), ...data }
      db.services.push(rec)
      return rec
    },
  },
  booking: {
    create: async ({ data }: { data: AnyObj }) => {
      const rec = { id: cuid(), createdAt: new Date(), updatedAt: new Date(), ...data }
      db.bookings.push(rec)
      return rec
    },
    findUnique: async ({ where }: { where: AnyObj }) => {
      const rec = db.bookings.find(b => b.id === where.id)
      return rec || null
    },
    findFirst: async ({ where, include }: { where: AnyObj, include?: AnyObj }) => {
      const rec = db.bookings.find(b => (!where.id || b.id === where.id) && (!where.userId || b.userId === where.userId))
      if (!rec) return null
      const out: AnyObj = { ...rec }
      if (include?.service?.select) {
        const svc = db.services.find(s => s.id === rec.serviceId) || {}
        out.service = {}
        if (include.service.select.duration) out.service.duration = svc.duration
        if (include.service.select.price) out.service.price = svc.price
      }
      if (include?.payment?.select) {
        const pay = db.payments.find(p => p.bookingId === rec.id) || {}
        out.payment = {}
        const sel = include.payment.select
        if (sel.id) out.payment.id = pay.id
        if (sel.status) out.payment.status = pay.status
        if (sel.statusEnum) out.payment.statusEnum = pay.statusEnum
        if (sel.amountPaise) out.payment.amountPaise = pay.amountPaise
        if (sel.gatewayPaymentId) out.payment.gatewayPaymentId = pay.gatewayPaymentId
      }
      return out
    },
    update: async ({ where, data }: { where: AnyObj, data: AnyObj }) => {
      const idx = db.bookings.findIndex(b => b.id === where.id)
      if (idx === -1) return null
      db.bookings[idx] = { ...db.bookings[idx], ...data, updatedAt: new Date() }
      return db.bookings[idx]
    }
  },
  payment: {
    create: async ({ data }: { data: AnyObj }) => {
      const rec = { id: cuid(), createdAt: new Date(), ...data }
      db.payments.push(rec)
      return rec
    },
  },
  refund: {
    findFirst: async ({ where }: { where: AnyObj }) => {
      if (where?.payment?.bookingId) {
        const pay = db.payments.find(p => p.bookingId === where.payment.bookingId)
        if (!pay) return null
        return db.refunds.find(r => r.paymentId === pay.id) || null
      }
      if (where?.paymentId) {
        return db.refunds.find(r => r.paymentId === where.paymentId) || null
      }
      return null
    },
    create: async ({ data }: { data: AnyObj }) => {
      const rec = { id: cuid(), createdAt: new Date(), ...data }
      db.refunds.push(rec)
      return rec
    },
  },
  $disconnect: async () => { /* no-op */ }
}

// Mock the prisma module to use the in-memory mock
jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

// Mock auth BEFORE importing the route to avoid loading next-auth ESM in test
let mockUserId: string | undefined
jest.mock('@/lib/auth', () => ({
  auth: async () => (mockUserId ? { user: { id: mockUserId, role: 'USER' } } : null)
}))

// Get mocked prisma for seeding via dynamic import to preserve mock timing
let prisma: any

let Bookings: any

function patch(url: string, body: any) {
  return new NextRequest(new Request(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any)
}

describe('Bookings cancel refund policy', () => {
  let userId: string
  let healerId: string
  let serviceId: string
  const pricePaise = 15000
  let bookingFull: any, bookingHalf: any, bookingNone: any, bookingCredit: any

  beforeAll(async () => {
    process.env.REFUNDS_ENABLED = 'false'
    // Load mocked prisma after jest.mock hooks
    prisma = (await import('@/lib/prisma')).prisma
    const user = await prisma.user.create({ data: { email: `cancel_${Date.now()}@ex.com`, password: 'x', role: 'USER' } })
    userId = user.id
    mockUserId = userId
    // Import route after auth mock is in place
    Bookings = await import('@/app/api/bookings/[id]/route')
    const healerUser = await prisma.user.create({ data: { email: `healer_${Date.now()}@ex.com`, password: 'x', role: 'HEALER' } })
    const healer = await prisma.healer.create({ data: { userId: healerUser.id, bio: 'x', availability: { monday: { start: '10:00', end: '20:00' } } } })
    healerId = healer.id
    const service = await prisma.service.create({ data: { name: 'Therapy', slug: `therapy-${Date.now()}`, description: 'x', category: 'GEN', price: pricePaise / 100, duration: 60 } })
    serviceId = service.id

    const now = new Date()
    const startFull = new Date(now.getTime() + 49 * 60 * 60 * 1000) // ≥48h → FULL
    const startHalf = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 60 * 1000) // >=24h → HALF (1m buffer)
    const startNone = new Date(now.getTime() + 12 * 60 * 60 * 1000) // <24h → NONE

    bookingFull = await prisma.booking.create({ data: { userId, healerId, serviceId, scheduledAt: startFull, durationMin: 60, status: 'CONFIRMED', pricePaise } })
    bookingHalf = await prisma.booking.create({ data: { userId, healerId, serviceId, scheduledAt: startHalf, durationMin: 60, status: 'CONFIRMED', pricePaise } })
    bookingNone = await prisma.booking.create({ data: { userId, healerId, serviceId, scheduledAt: startNone, durationMin: 60, status: 'CONFIRMED', pricePaise } })
    bookingCredit = await prisma.booking.create({ data: { userId, healerId, serviceId, scheduledAt: startFull, durationMin: 60, status: 'CONFIRMED', pricePaise } })

    await prisma.payment.create({ data: { bookingId: bookingFull.id, userId, gateway: 'razorpay', status: 'success', amountPaise: pricePaise, gatewayPaymentId: 'pay_full' } })
    await prisma.payment.create({ data: { bookingId: bookingHalf.id, userId, gateway: 'razorpay', status: 'success', amountPaise: pricePaise, gatewayPaymentId: 'pay_half' } })
    await prisma.payment.create({ data: { bookingId: bookingNone.id, userId, gateway: 'razorpay', status: 'success', amountPaise: pricePaise, gatewayPaymentId: 'pay_none' } })
    // bookingCredit: no payment
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('FULL refund (≥48h)', async () => {
    const req = patch(`http://localhost/api/bookings/${bookingFull.id}`, { action: 'cancel' })
    const res = await (Bookings as any).PATCH(req, { params: Promise.resolve({ id: bookingFull.id }) })
    expect(res.status).toBeLessThan(300)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.refund.band).toBe('FULL')
    expect(json.refund.refundPaise).toBe(pricePaise)
    const after = await prisma.booking.findUnique({ where: { id: bookingFull.id } })
    expect(after?.status).toBe('CANCELLED')
    const refund = await prisma.refund.findFirst({ where: { payment: { bookingId: bookingFull.id } } })
    expect(refund?.amountPaise).toBe(pricePaise)
  // idempotent - use a fresh request instance
  const req2 = patch(`http://localhost/api/bookings/${bookingFull.id}`, { action: 'cancel' })
  const res2 = await (Bookings as any).PATCH(req2, { params: Promise.resolve({ id: bookingFull.id }) })
    const json2 = await res2.json()
  expect(Boolean(json2.alreadyCancelled)).toBe(true)
  })

  test('HALF refund (=24h)', async () => {
    const req = patch(`http://localhost/api/bookings/${bookingHalf.id}`, { action: 'cancel' })
    const res = await (Bookings as any).PATCH(req, { params: Promise.resolve({ id: bookingHalf.id }) })
    const json = await res.json()
    expect(json.refund.band).toBe('HALF')
    expect(json.refund.refundPaise).toBe(Math.floor(pricePaise / 2))
  })

  test('NONE refund (<24h)', async () => {
    const req = patch(`http://localhost/api/bookings/${bookingNone.id}`, { action: 'cancel' })
    const res = await (Bookings as any).PATCH(req, { params: Promise.resolve({ id: bookingNone.id }) })
    const json = await res.json()
    expect(json.refund.band).toBe('NONE')
    expect(json.refund.refundPaise).toBe(0)
    const refund = await prisma.refund.findFirst({ where: { payment: { bookingId: bookingNone.id } } })
    expect(refund).toBeNull()
  })

  test('Credits booking → no refund row', async () => {
    const req = patch(`http://localhost/api/bookings/${bookingCredit.id}`, { action: 'cancel' })
    const res = await (Bookings as any).PATCH(req, { params: Promise.resolve({ id: bookingCredit.id }) })
    const json = await res.json()
    expect(json.refund.refundPaise).toBe(0)
    const refund = await prisma.refund.findFirst({ where: { payment: { bookingId: bookingCredit.id } } })
    expect(refund).toBeNull()
  })
})
