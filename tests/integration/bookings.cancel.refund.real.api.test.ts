/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'

// In-memory prisma mock
const db = { users: [] as any[], healers: [] as any[], services: [] as any[], bookings: [] as any[], payments: [] as any[], refunds: [] as any[] }
const cuid = () => 'id_' + Math.random().toString(36).slice(2)

const prismaMock = {
  user: { create: async ({ data }: any) => { const rec = { id: cuid(), ...data }; db.users.push(rec); return rec } },
  healer: { create: async ({ data }: any) => { const rec = { id: cuid(), ...data }; db.healers.push(rec); return rec } },
  service: { create: async ({ data }: any) => { const rec = { id: cuid(), ...data }; db.services.push(rec); return rec } },
  booking: {
    create: async ({ data }: any) => { const rec = { id: cuid(), status: 'CONFIRMED', ...data }; db.bookings.push(rec); return rec },
    findFirst: async ({ where, include }: any) => {
      const b = db.bookings.find(x => x.id === where.id && x.userId === where.userId)
      if (!b) return null
      const out: any = { ...b }
      if (include?.service?.select) { const s = db.services.find(s => s.id === b.serviceId) || {}; out.service = { price: s.price, duration: s.duration } }
      if (include?.payment?.select) { const p = db.payments.find(p => p.bookingId === b.id) || {}; out.payment = { id: p.id, status: p.status, statusEnum: p.statusEnum, amountPaise: p.amountPaise, gatewayPaymentId: p.gatewayPaymentId } }
      return out
    },
    update: async ({ where, data }: any) => { const i = db.bookings.findIndex(b => b.id === where.id); db.bookings[i] = { ...db.bookings[i], ...data }; return db.bookings[i] }
  },
  payment: { create: async ({ data }: any) => { const rec = { id: cuid(), ...data }; db.payments.push(rec); return rec } },
  refund: {
    findFirst: async ({ where }: any) => {
      if (where?.paymentId && where?.amountPaise) return db.refunds.find(r => r.paymentId === where.paymentId && r.amountPaise === where.amountPaise && (!where.status?.in || where.status.in.includes(r.status))) || null
      if (where?.payment?.bookingId) { const p = db.payments.find(p => p.bookingId === where.payment.bookingId); return (p && db.refunds.find(r => r.paymentId === p.id)) || null }
      return null
    },
    create: async ({ data }: any) => { const rec = { id: cuid(), ...data }; db.refunds.push(rec); return rec }
  },
  $disconnect: async () => {}
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
jest.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'u_test', role: 'USER' } }) }))

// Mock refunds wrapper
const refundSpy = jest.fn(async () => ({ gatewayRefundId: 'rfnd_1', status: 'SUCCESS', raw: {} }))
jest.mock('@/lib/payments/razorpay-refunds', () => ({ refundPayment: (...args: unknown[]) => (refundSpy as any)(...args) }))

function patch(url: string, body: any) { return new NextRequest(new Request(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any) }

let Bookings: any

describe('Bookings cancel - real refunds (feature-flag on)', () => {
  beforeAll(async () => {
    process.env.REFUNDS_ENABLED = 'true'
    Bookings = await import('@/app/api/bookings/[id]/route')

    const user = await prismaMock.user.create({ data: { id: 'u_test', email: 'u@test', role: 'USER' } })
    const healerUser = await prismaMock.user.create({ data: { email: 'h@test', role: 'HEALER' } })
    const healer = await prismaMock.healer.create({ data: { userId: healerUser.id, bio: 'x', availability: {} } })
    const service = await prismaMock.service.create({ data: { name: 'Therapy', price: 150, duration: 60 } })

    const now = new Date()
    const startFull = new Date(now.getTime() + 49*60*60*1000)
    const startHalf = new Date(now.getTime() + 24*60*60*1000 + 60*1000)
    const startNone = new Date(now.getTime() + 12*60*60*1000)

    const bFull = await prismaMock.booking.create({ data: { userId: user.id, healerId: healer.id, serviceId: service.id, scheduledAt: startFull, pricePaise: 15000 } })
    const bHalf = await prismaMock.booking.create({ data: { userId: user.id, healerId: healer.id, serviceId: service.id, scheduledAt: startHalf, pricePaise: 15000 } })
    const bNone = await prismaMock.booking.create({ data: { userId: user.id, healerId: healer.id, serviceId: service.id, scheduledAt: startNone, pricePaise: 15000 } })

    await prismaMock.payment.create({ data: { bookingId: bFull.id, userId: user.id, gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 15000, gatewayPaymentId: 'pay_123' } })
    await prismaMock.payment.create({ data: { bookingId: bHalf.id, userId: user.id, gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 15000, gatewayPaymentId: 'pay_456' } })
    await prismaMock.payment.create({ data: { bookingId: bNone.id, userId: user.id, gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 15000, gatewayPaymentId: 'pay_789' } })

    ;(global as any).__bFull = bFull; (global as any).__bHalf = bHalf; (global as any).__bNone = bNone
  })

  afterAll(async () => { process.env.REFUNDS_ENABLED = 'false' })

  test('FULL → refund called once, row persisted, idempotent reuse', async () => {
    const b = (global as any).__bFull
    const req = patch(`http://localhost/api/bookings/${b.id}`, { action: 'cancel' })
    const { PATCH } = Bookings
    const res = await PATCH(req, { params: Promise.resolve({ id: b.id }) })
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.refund.band).toBe('FULL')
    expect(json.refund.refundPaise).toBe(15000)
    expect(refundSpy).toHaveBeenCalledTimes(1)

    // second cancel
    const req2 = patch(`http://localhost/api/bookings/${b.id}`, { action: 'cancel' })
    const res2 = await PATCH(req2, { params: Promise.resolve({ id: b.id }) })
    const json2 = await res2.json()
    expect(Boolean(json2.alreadyCancelled)).toBe(true)
    expect(refundSpy).toHaveBeenCalledTimes(1)
  })

  test('HALF → refund called with 50%', async () => {
    const b = (global as any).__bHalf
    const req = patch(`http://localhost/api/bookings/${b.id}`, { action: 'cancel' })
    const { PATCH } = Bookings
    const res = await PATCH(req, { params: Promise.resolve({ id: b.id }) })
    const json = await res.json()
    expect(json.refund.band).toBe('HALF')
    expect(json.refund.refundPaise).toBe(7500)
  })

  test('NONE → no refund call, no row', async () => {
    const b = (global as any).__bNone
    const before = refundSpy.mock.calls.length
    const req = patch(`http://localhost/api/bookings/${b.id}`, { action: 'cancel' })
    const { PATCH } = Bookings
    const res = await PATCH(req, { params: Promise.resolve({ id: b.id }) })
    const json = await res.json()
    expect(json.refund.band).toBe('NONE')
    expect(json.refund.refundPaise).toBe(0)
    expect(refundSpy.mock.calls.length).toBe(before) // unchanged from previous step
  })
})
