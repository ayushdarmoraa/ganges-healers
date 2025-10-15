/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import { prisma } from '@/lib/prisma'

// Mock auth like existing pattern
jest.mock('@/lib/auth', () => {
  return {
    auth: async () => ({
      user: {
        id: process.env.TEST_USER_ID || 'admin-test-user',
        role: process.env.TEST_USER_ROLE || 'ADMIN',
        vip: true,
        freeSessionCredits: 0,
        email: 'admin@test.local'
      }
    })
  }
})

function isoDay(d: Date){ return d.toISOString().slice(0,10) }

describe('Admin Payments Analytics API', () => {
  beforeAll(async () => {
    // Ensure there is seeded data; if missing, create minimal synthetic rows for analytics read tests
    const count = await prisma.payment.count()
    if (count === 0) {
      const user = await prisma.user.create({ data: { email: 'analytics_' + Date.now() + '@ex.com', password: 'x', role: 'USER' } })
      // One session payment success
      await prisma.payment.create({ data: { userId: user.id, gateway: 'rzp', status: 'success', statusEnum: 'SUCCESS', amountPaise: 12345, type: 'SESSION' } as any })
      // One membership payment success and active membership for mrr
      const plan = await prisma.membershipPlan.upsert({
        where: { slug: 'vip-monthly' },
        update: { isActive: true },
        create: { slug: 'vip-monthly', title: 'VIP Monthly', pricePaise: 19900, interval: 'MONTHLY', razorpayPlanId: 'plan_seed_monthly', isActive: true }
      })
      await prisma.payment.create({ data: { userId: user.id, gateway: 'rzp', status: 'success', statusEnum: 'SUCCESS', amountPaise: plan.pricePaise, type: 'MEMBERSHIP' } as any })
      await prisma.vIPMembership.create({ data: { userId: user.id, planId: plan.id, subscriptionId: 'sub_seed_' + Date.now(), status: 'active' } as any })
      // One refund row
      const p = await prisma.payment.create({ data: { userId: user.id, gateway: 'rzp', status: 'refunded', statusEnum: 'REFUNDED', amountPaise: 5000, type: 'SESSION' } as any })
      await prisma.refund.create({ data: { paymentId: p.id, amountPaise: 5000, gatewayRefundId: 'rf_seed_1', status: 'processed' } })
    }
    // Ensure at least one active membership to make MRR > 0, even if payments already existed
    const activeCount = await prisma.vIPMembership.count({ where: { status: 'active' } })
    if (activeCount === 0) {
      const user2 = await prisma.user.create({ data: { email: 'analytics_mrr_' + Date.now() + '@ex.com', password: 'x', role: 'USER' } })
      const plan2 = await prisma.membershipPlan.upsert({
        where: { slug: 'vip-monthly' },
        update: { isActive: true },
        create: { slug: 'vip-monthly', title: 'VIP Monthly', pricePaise: 19900, interval: 'MONTHLY', razorpayPlanId: 'plan_seed_monthly_2', isActive: true }
      })
      await prisma.vIPMembership.create({ data: { userId: user2.id, planId: plan2.id, subscriptionId: 'sub_seed_mrr_' + Date.now(), status: 'active' } as any })
    }
  })

  test('metrics basic math & shape', async () => {
    process.env.TEST_USER_ROLE = 'ADMIN'
    const to = new Date()
    const from = new Date(to.getTime() - 29*24*60*60*1000)
    const req = makeNextRequest(`http://localhost/api/admin/payments/metrics?from=${isoDay(from)}&to=${isoDay(to)}`)
    const mod = await import('@/app/api/admin/payments/metrics/route')
    const res: any = await (mod as any).GET(req)
    expect(res.status).toBe(200)
    const body = await readJSON(res)
    expect(body.kpi).toBeDefined()
    const { grossPaise, refundsPaise, netPaise, paymentsCount, aovPaise } = body.kpi
    expect(netPaise).toBe(grossPaise - refundsPaise)
    if (paymentsCount > 0) {
      expect(aovPaise).toBe(Math.round(grossPaise / paymentsCount))
    } else {
      expect(aovPaise).toBe(0)
    }
  // byType sum should not exceed gross; some legacy/other types may be omitted
  const byTypeSum = Object.values(body.byType).reduce((a:number,b:any)=>a+Number(b),0)
  expect(byTypeSum).toBeGreaterThanOrEqual(0)
  expect(byTypeSum).toBeLessThanOrEqual(grossPaise)
    // MRR should be > 0 given seeded monthly + yearly memberships
    expect(body.kpi.mrrPaise).toBeGreaterThan(0)
  })

  test('timeseries contiguous and byType keys', async () => {
    process.env.TEST_USER_ROLE = 'ADMIN'
    const to = new Date()
    const from = new Date(to.getTime() - 6*24*60*60*1000)
    const req = makeNextRequest(`http://localhost/api/admin/payments/timeseries?from=${isoDay(from)}&to=${isoDay(to)}`)
    const mod = await import('@/app/api/admin/payments/timeseries/route')
    const res: any = await (mod as any).GET(req)
    expect(res.status).toBe(200)
    const series = await readJSON(res)
    expect(Array.isArray(series)).toBe(true)
    expect(series.length).toBe(7)
    // check contiguous dates
    for (let idx=1; idx<series.length; idx++) {
      const prev = new Date(series[idx-1].date)
      const curr = new Date(series[idx].date)
      const diff = (curr.getTime() - prev.getTime()) / (24*60*60*1000)
      expect(diff).toBe(1)
      ;(['SESSION','PROGRAM','MEMBERSHIP','STORE','COURSE'] as const).forEach((k) => {
        expect(Object.prototype.hasOwnProperty.call(series[idx].byType, k)).toBe(true)
      })
    }
  })

  test('latest limit respected', async () => {
    process.env.TEST_USER_ROLE = 'ADMIN'
    const req = makeNextRequest('http://localhost/api/admin/payments/latest?limit=5')
    const mod = await import('@/app/api/admin/payments/latest/route')
    const res: any = await (mod as any).GET(req)
    expect(res.status).toBe(200)
    const body = await readJSON(res)
    expect(body.items.length).toBeLessThanOrEqual(5)
  })

  test('refunds limit respected', async () => {
    process.env.TEST_USER_ROLE = 'ADMIN'
    const req = makeNextRequest('http://localhost/api/admin/payments/refunds?limit=1')
    const mod = await import('@/app/api/admin/payments/refunds/route')
    const res: any = await (mod as any).GET(req)
    expect(res.status).toBe(200)
    const body = await readJSON(res)
    expect(body.items.length).toBeLessThanOrEqual(1)
  })

  test('admin guard returns 403 for non-admin', async () => {
    process.env.TEST_USER_ROLE = 'USER'
    const req = makeNextRequest('http://localhost/api/admin/payments/latest')
    const mod = await import('@/app/api/admin/payments/latest/route')
    const res: any = await (mod as any).GET(req)
    expect(res.status).toBe(403)
  })
})
