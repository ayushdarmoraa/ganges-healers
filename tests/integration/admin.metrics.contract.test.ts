/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { BY_TYPE_KEYS } from '@/lib/admin/metrics-constants'

// In-memory Prisma mock for seeding and query expectations
const db = {
  payments: [] as any[],
  refunds: [] as any[],
  programs: [] as any[],
  memberships: [] as any[],
}
const cuid = () => 'id_' + Math.random().toString(36).slice(2)

const prismaMock = {
  payment: {
    findMany: async ({ where, select }: any) => {
      const items = db.payments.filter((p) => {
        if (where?.statusEnum && p.statusEnum !== where.statusEnum) return false
        if (where?.type && p.type !== where.type) return false
        if (where?.createdAt) {
          const { gte, lte } = where.createdAt
          if (gte && p.createdAt < gte) return false
          if (lte && p.createdAt > lte) return false
        }
        return true
      })
      return items.map((p) => {
        const out: any = {}
        if (select?.createdAt) out.createdAt = p.createdAt
        if (select?.amountPaise) out.amountPaise = p.amountPaise
        if (select?.type) out.type = p.type
        if (select?.metadata) out.metadata = p.metadata
        if (select?.id) out.id = p.id
        if (select?.userId) out.userId = p.userId
        return out
      })
    },
  },
  refund: {
    findMany: async ({ where, select, orderBy, take }: any) => {
      let items = db.refunds.filter((r) => {
        if (where?.createdAt) {
          const { gte, lte } = where.createdAt
          if (gte && r.createdAt < gte) return false
          if (lte && r.createdAt > lte) return false
        }
        return true
      })
      if (orderBy?.createdAt === 'desc') items = items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      if (typeof take === 'number') items = items.slice(0, take)
      return items.map((r) => {
        const out: any = {}
        if (select?.id) out.id = r.id
        if (select?.amountPaise) out.amountPaise = r.amountPaise
        if (select?.createdAt) out.createdAt = r.createdAt
        if (select?.paymentId) out.paymentId = r.paymentId
        return out
      })
    },
  },
  program: {
    findMany: async ({ where, select }: any) => {
      const items = db.programs.filter((p) => where?.id?.in?.includes(p.id))
      return items.map((r) => ({ id: r.id, title: r.title }))
    },
  },
  vIPMembership: {
    findMany: async () => {
      // very small stub: we only need plan.interval and plan.pricePaise
      return db.memberships.map((m) => ({ ...m }))
    },
  },
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

// Admin auth mock
jest.mock('@/lib/rbac', () => ({ requireAdmin: async () => true }))

function makeReq(url: string) {
  return new NextRequest(new Request(url))
}

let Metrics: any
let Timeseries: any
let Latest: any

describe('Admin metrics contracts', () => {
  beforeAll(async () => {
    Metrics = await import('@/app/api/admin/payments/metrics/route')
    Timeseries = await import('@/app/api/admin/payments/timeseries/route')
    Latest = await import('@/app/api/admin/payments/latest/route')

    const now = new Date()
    const d = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

    // Seed payments of different types
    const types = ['SESSION','PROGRAM','MEMBERSHIP','STORE','COURSE'] as const
    for (const t of types) {
      db.payments.push({ id: cuid(), createdAt: d(0), amountPaise: 1000, type: t, statusEnum: 'SUCCESS', metadata: t === 'PROGRAM' ? { programId: 'p1' } : {} , userId: 'u1' })
    }
    // Additional day to exercise timeseries
    db.payments.push({ id: cuid(), createdAt: d(1), amountPaise: 500, type: 'SESSION', statusEnum: 'SUCCESS', metadata: {}, userId: 'u2' })

    // Seed program for topPrograms lookup
    db.programs.push({ id: 'p1', title: 'Yoga Basics' })

    // Seed some refunds
    db.refunds.push({ id: cuid(), createdAt: d(0), amountPaise: 100, paymentId: db.payments[0].id })
  })

  test('GET /api/admin/metrics returns normalized byType and stable fields', async () => {
    const req = makeReq('http://localhost/api/admin/payments/metrics')
    const res = await Metrics.GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.range).toBeTruthy()
    // kpi: numeric fields exist
    expect(typeof body.kpi.grossPaise).toBe('number')
    expect(typeof body.kpi.netPaise).toBe('number')
    expect(typeof body.kpi.paymentsCount).toBe('number')
    expect(typeof body.kpi.refundsCount).toBe('number')
    expect(typeof body.kpi.aovPaise).toBe('number')
    expect(typeof body.kpi.mrrPaise).toBe('number')
    // byType exactly 5 keys
    expect(Object.keys(body.byType).sort()).toEqual([...BY_TYPE_KEYS].sort())
    for (const k of BY_TYPE_KEYS) expect(typeof body.byType[k]).toBe('number')
    // topPrograms array
    expect(Array.isArray(body.topPrograms)).toBe(true)
  })

  test('GET /api/admin/metrics?type=MEMBERSHIP filters but keeps all keys', async () => {
    const req = makeReq('http://localhost/api/admin/payments/metrics?type=MEMBERSHIP')
    const res = await Metrics.GET(req)
    const body = await res.json()
    expect(Object.keys(body.byType).sort()).toEqual([...BY_TYPE_KEYS].sort())
    expect(body.byType.MEMBERSHIP).toBeGreaterThan(0)
    expect(body.byType.SESSION).toBe(0)
    expect(body.byType.PROGRAM).toBe(0)
    expect(body.byType.STORE).toBe(0)
    expect(body.byType.COURSE).toBe(0)
  })

  test('GET /api/admin/metrics/timeseries returns normalized series', async () => {
    const req = makeReq('http://localhost/api/admin/payments/timeseries?range=7d')
    const res = await Timeseries.GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
    for (const el of body) {
      expect(Object.keys(el.byType).sort()).toEqual([...BY_TYPE_KEYS].sort())
      for (const k of BY_TYPE_KEYS) expect(typeof el.byType[k]).toBe('number')
      expect(typeof el.netPaise).toBe('number')
    }
  })

  test('GET /api/admin/payments/latest exposes stable fields', async () => {
    const req = makeReq('http://localhost/api/admin/payments/latest')
    const res = await Latest.GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items.length).toBeGreaterThan(0)
    const item = body.items[0]
    expect(typeof item.id).toBe('string')
    expect(new Date(item.createdAt).toString()).not.toBe('Invalid Date')
    expect(typeof item.amountPaise).toBe('number')
    expect(typeof item.type === 'string' || item.type === null).toBe(true)
    expect(typeof item.source === 'string' || item.source === null).toBe(true)
    expect(typeof item.userId === 'string' || item.userId === null).toBe(true)
  })
})
