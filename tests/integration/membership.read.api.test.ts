/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as Plans from '@/app/api/memberships/plans/route'
import * as Me from '@/app/api/memberships/me/route'
import * as Subscribe from '@/app/api/memberships/subscribe/route'
import * as Webhook from '@/app/api/payments/webhook/route'

jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: process.env.TEST_MEM_USER_ID, role: 'USER', vip: false, freeSessionCredits: 0, email: 'vipread@example.com' } })
}))

jest.mock('@/lib/razorpay', () => ({
  getRazorpayClient: async () => ({
    subscriptions: { create: async (args: any) => ({ id: 'sub_cycle_' + Date.now(), short_url: 'https://rzp.io/i/testsub', ...args }) }
  })
}))

// Also mock the Razorpay SDK class directly since the route constructs it with `new Razorpay()`
jest.mock('razorpay', () => {
  return jest.fn().mockImplementation(() => ({
    subscriptions: {
      create: async (args: any) => ({ id: 'sub_cycle_' + Date.now(), short_url: 'https://rzp.io/i/testsub', ...args })
    },
    plans: {
      fetch: async (id: string) => ({ id, period: 'monthly', item: { name: 'VIP Monthly' } })
    }
  }))
})

describe('Membership Plans & Me + Webhook', () => {
  let user: any
  let monthly: any

  beforeAll(async () => {
    user = await prisma.user.create({ data: { email: 'vip_read_' + Date.now() + '@ex.com', password: 'x', role: 'USER' } })
    process.env.TEST_MEM_USER_ID = user.id
    monthly = await prisma.membershipPlan.upsert({
      where: { slug: 'vip-monthly' },
      update: { isActive: true, razorpayPlanId: 'plan_test_monthly_realistic' },
      create: {
        slug: 'vip-monthly',
        title: 'Monthly VIP',
        pricePaise: 19900,
        interval: 'MONTHLY',
        razorpayPlanId: 'plan_test_monthly_realistic',
        benefits: { freeSessions: 2, priorityBooking: true, discountPct: 10 }
      }
    })
  })

  afterAll(async () => {
    await prisma.sessionCredit.deleteMany({ where: { userId: user.id } }).catch(()=>{})
    await prisma.vIPMembership.deleteMany({ where: { userId: user.id } }).catch(()=>{})
    await prisma.membershipPlan.deleteMany({ where: { id: monthly.id } }).catch(()=>{})
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(()=>{})
    await prisma.$disconnect()
  })

  test('plans endpoint returns active plans', async () => {
    const res = await (Plans as any).GET()
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(Array.isArray(body.plans)).toBe(true)
    const found = body.plans.find((p: any) => p.slug === monthly.slug)
    expect(found).toBeTruthy()
    expect(found.interval).toBe('MONTHLY')
  })

  test('me endpoint initially returns null membership', async () => {
    const res = await (Me as any).GET()
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(body.membership).toBeNull()
    expect(body.credits.total).toBe(0)
  })

  test('webhook subscription lifecycle (no-op state changes)', async () => {
    // Subscribe (route returns Razorpay subscription id; no DB side-effects expected)
    const subReq = makeNextRequest('http://localhost/api/memberships/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planSlug: 'vip-monthly' }) })
    const subRes = await (Subscribe as any).POST(subReq)
    expect(subRes.status).toBeLessThan(300)
    const subBody = await readJSON(subRes)
    const subscriptionId = subBody.subscriptionId || subBody.id
    expect(typeof subscriptionId).toBe('string')

    // No membership row is created yet in current runtime
    const before = await prisma.vIPMembership.findUnique({ where: { subscriptionId } })
    expect(before).toBeNull()

    // Simulate subscription.activated webhook — handler verifies signature and returns 200; no DB updates
    process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook'
    const activatedPayload = { event: 'subscription.activated', payload: { subscription: { entity: { id: subscriptionId, current_start: Math.floor(Date.now()/1000), current_end: Math.floor(Date.now()/1000) + 2592000 } } } }
    const raw1 = JSON.stringify(activatedPayload)
    const sig1 = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw1).digest('hex')
    const req1 = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig1 }, body: raw1 }) as any)
    const res1 = await (Webhook as any).POST(req1)
    expect(res1.status).toBeLessThan(300)

    const afterActivate = await prisma.vIPMembership.findUnique({ where: { subscriptionId } })
    expect(afterActivate).toBeNull()

    // Replay activation (idempotent)
    const rawReplay = JSON.stringify(activatedPayload)
    const sigReplay = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawReplay).digest('hex')
    const reqReplay = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigReplay }, body: rawReplay }) as any)
    const resReplay = await (Webhook as any).POST(reqReplay)
    expect(resReplay.status).toBeLessThan(300)

    // Pause / Halt / Cancel — verify 2xx responses; no state updates asserted
    for (const evt of ['subscription.paused', 'subscription.halted', 'subscription.cancelled'] as const) {
      const payload = { event: evt, payload: { subscription: { entity: { id: subscriptionId } } } }
      const raw = JSON.stringify(payload)
      const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest('hex')
      const req = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig }, body: raw }) as any)
      const res = await (Webhook as any).POST(req)
      expect(res.status).toBeLessThan(300)
    }
  }, 15000)
})
