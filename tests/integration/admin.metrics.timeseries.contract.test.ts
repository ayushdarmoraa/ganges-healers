/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { BY_TYPE_KEYS } from '@/lib/admin/metrics-constants'

const db = {
  payments: [] as any[],
  refunds: [] as any[],
}
const cuid = () => 'id_' + Math.random().toString(36).slice(2)

const prismaMock = {
  payment: {
    findMany: async ({ where }: any) => {
      const items = db.payments.filter((p) => {
        if (where?.statusEnum && p.statusEnum !== where.statusEnum) return false
        if (where?.type && p.type !== where.type) return false
        const { gte, lte } = where.createdAt || {}
        if (gte && p.createdAt < gte) return false
        if (lte && p.createdAt > lte) return false
        return true
      })
      return items.map((p) => ({ createdAt: p.createdAt, amountPaise: p.amountPaise, type: p.type }))
    },
  },
  refund: {
    findMany: async ({ where }: any) => {
      const items = db.refunds.filter((r) => {
        const { gte, lte } = where.createdAt || {}
        if (gte && r.createdAt < gte) return false
        if (lte && r.createdAt > lte) return false
        return true
      })
      return items.map((r) => ({ createdAt: r.createdAt, amountPaise: r.amountPaise }))
    },
  },
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
jest.mock('@/lib/rbac', () => ({ requireAdmin: async () => true }))

function makeReq(url: string) { return new NextRequest(new Request(url)) }

let Timeseries: any

describe('Admin metrics timeseries contracts', () => {
  beforeAll(async () => {
    Timeseries = await import('@/app/api/admin/payments/timeseries/route')
    const now = new Date()
    const daysAgo = (n: number) => new Date(now.getTime() - n*24*60*60*1000)

    // payments across days and types
    db.payments.push({ id: cuid(), createdAt: daysAgo(0), amountPaise: 500, type: 'SESSION', statusEnum: 'SUCCESS' })
    db.payments.push({ id: cuid(), createdAt: daysAgo(1), amountPaise: 700, type: 'PROGRAM', statusEnum: 'SUCCESS' })
    db.payments.push({ id: cuid(), createdAt: daysAgo(1), amountPaise: 900, type: 'MEMBERSHIP', statusEnum: 'SUCCESS' })

    // refunds
    db.refunds.push({ id: cuid(), createdAt: daysAgo(0), amountPaise: 100 })
  })

  test('GET /api/admin/metrics/timeseries?range=7d normalizes byType in each element', async () => {
    const req = makeReq('http://localhost/api/admin/payments/timeseries?range=7d')
    const res = await Timeseries.GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
    for (const row of body) {
      expect(Object.keys(row.byType).sort()).toEqual([...BY_TYPE_KEYS].sort())
      for (const k of BY_TYPE_KEYS) expect(typeof row.byType[k]).toBe('number')
    }
  })
})
