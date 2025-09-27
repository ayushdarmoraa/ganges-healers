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
    subscriptions: { create: async (args: any) => ({ id: 'sub_cycle_' + Date.now(), ...args }) }
  })
}))

describe('Membership Plans & Me + Webhook', () => {
  let user: any
  let monthly: any

  beforeAll(async () => {
    user = await prisma.user.create({ data: { email: 'vip_read_' + Date.now() + '@ex.com', password: 'x', role: 'USER' } })
    process.env.TEST_MEM_USER_ID = user.id
    monthly = await prisma.membershipPlan.create({
      data: {
        slug: 'monthly-vip-' + Date.now(),
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

  test('webhook subscription lifecycle', async () => {
    // Subscribe (pending)
    const subReq = makeNextRequest('http://localhost/api/memberships/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planSlug: monthly.slug }) })
    const subRes = await (Subscribe as any).POST(subReq)
    expect(subRes.status).toBeLessThan(300)
    const subBody = await readJSON(subRes)
    const subscriptionId = subBody.subscriptionId
    const membership = await prisma.vIPMembership.findUnique({ where: { subscriptionId } })
    expect(membership?.status).toBe('pending')

    // Simulate subscription.activated webhook
    process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook'
    const activatedPayload = { event: 'subscription.activated', payload: { subscription: { entity: { id: subscriptionId, current_start: Math.floor(Date.now()/1000), current_end: Math.floor(Date.now()/1000) + 2592000 } } } }
    const raw1 = JSON.stringify(activatedPayload)
    const sig1 = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw1).digest('hex')
    const req1 = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig1 }, body: raw1 }) as any)
    const res1 = await (Webhook as any).POST(req1)
    expect(res1.status).toBeLessThan(300)
    const afterActivate = await prisma.vIPMembership.findUnique({ where: { subscriptionId } })
    expect(afterActivate?.status).toBe('active')
    const credits = await prisma.sessionCredit.findMany({ where: { membershipId: afterActivate?.id } })
    expect(credits.length).toBe(1)
    const userVip = await prisma.user.findUnique({ where: { id: user.id } })
    expect(userVip?.vip).toBe(true)

    // Replay activation (idempotent - no new credit)
    const rawReplay = JSON.stringify(activatedPayload)
    const sigReplay = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawReplay).digest('hex')
    const reqReplay = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigReplay }, body: rawReplay }) as any)
    const resReplay = await (Webhook as any).POST(reqReplay)
    expect(resReplay.status).toBeLessThan(300)
    const creditsAfterReplay = await prisma.sessionCredit.findMany({ where: { membershipId: afterActivate?.id } })
    expect(creditsAfterReplay.length).toBe(1)

    // Pause
    const pausedPayload = { event: 'subscription.paused', payload: { subscription: { entity: { id: subscriptionId } } } }
    const rawPause = JSON.stringify(pausedPayload)
    const sigPause = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawPause).digest('hex')
    const reqPause = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigPause }, body: rawPause }) as any)
    await (Webhook as any).POST(reqPause)
    expect((await prisma.vIPMembership.findUnique({ where: { subscriptionId } }))?.status).toBe('paused')

    // Halt
    const haltedPayload = { event: 'subscription.halted', payload: { subscription: { entity: { id: subscriptionId } } } }
    const rawHalt = JSON.stringify(haltedPayload)
    const sigHalt = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawHalt).digest('hex')
    const reqHalt = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigHalt }, body: rawHalt }) as any)
    await (Webhook as any).POST(reqHalt)
    expect((await prisma.vIPMembership.findUnique({ where: { subscriptionId } }))?.status).toBe('halted')

    // Cancel
    const cancelledPayload = { event: 'subscription.cancelled', payload: { subscription: { entity: { id: subscriptionId } } } }
    const rawCancel = JSON.stringify(cancelledPayload)
    const sigCancel = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(rawCancel).digest('hex')
    const reqCancel = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigCancel }, body: rawCancel }) as any)
    await (Webhook as any).POST(reqCancel)
    expect((await prisma.vIPMembership.findUnique({ where: { subscriptionId } }))?.status).toBe('cancelled')
  }, 15000)
})
