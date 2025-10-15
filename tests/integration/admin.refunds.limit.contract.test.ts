/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'

const db = { refunds: [] as any[] }
const cuid = () => 'id_' + Math.random().toString(36).slice(2)

const prismaMock = {
  refund: {
    findMany: async ({ where, orderBy, take }: any) => {
      let items = db.refunds.filter((r) => {
        const { gte, lte } = where.createdAt || {}
        if (gte && r.createdAt < gte) return false
        if (lte && r.createdAt > lte) return false
        return true
      })
      if (orderBy?.createdAt === 'desc') items = items.sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime())
      if (typeof take === 'number') items = items.slice(0, take)
      return items.map((r) => ({ id: r.id, amountPaise: r.amountPaise, createdAt: r.createdAt, paymentId: r.paymentId }))
    },
  },
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
jest.mock('@/lib/rbac', () => ({ requireAdmin: async () => true }))

function makeReq(url: string) { return new NextRequest(new Request(url)) }

let Refunds: any

describe('Admin refunds limit contracts', () => {
  beforeAll(async () => {
    Refunds = await import('@/app/api/admin/payments/refunds/route')
    const now = Date.now()
    for (let i = 0; i < 150; i++) {
      db.refunds.push({ id: cuid(), createdAt: new Date(now - i * 1000), amountPaise: 100 + i, paymentId: 'pay_' + i })
    }
  })

  test('default limit 20', async () => {
    const req = makeReq('http://localhost/api/admin/payments/refunds')
    const res = await Refunds.GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.items)).toBe(true)
    expect(body.items.length).toBe(20)
  })

  test('limit=5', async () => {
    const req = makeReq('http://localhost/api/admin/payments/refunds?limit=5')
    const res = await Refunds.GET(req)
    const body = await res.json()
    expect(body.items.length).toBe(5)
  })

  test('limit capped at 100', async () => {
    const req = makeReq('http://localhost/api/admin/payments/refunds?limit=500')
    const res = await Refunds.GET(req)
    const body = await res.json()
    expect(body.items.length).toBe(100)
  })
})
