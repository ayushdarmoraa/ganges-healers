/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as Subscribe from '@/app/api/memberships/subscribe/route'

jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: process.env.TEST_USER_ID, role: 'USER', vip: false, freeSessionCredits: 0, email: 'vip@example.com' } })
}))

jest.mock('@/lib/razorpay', () => ({
  getRazorpayClient: async () => ({
    subscriptions: { create: async (args: any) => ({ id: 'sub_test_' + Date.now(), ...args }) }
  })
}))

describe('Membership Subscribe', () => {
  let user: any
  let plan: any

  beforeAll(async () => {
    user = await prisma.user.create({ data: { email: 'vip_user_' + Date.now() + '@ex.com', password: 'x', role: 'USER' } })
    process.env.TEST_USER_ID = user.id
    plan = await prisma.membershipPlan.create({
      data: {
        slug: 'monthly-' + Date.now(),
        title: 'Monthly VIP',
        pricePaise: 50000,
        interval: 'MONTHLY',
        razorpayPlanId: 'plan_test_monthly',
        benefits: { freeSessions: 2, priorityBooking: true }
      }
    })
  })

  afterAll(async () => {
    await prisma.vIPMembership.deleteMany({ where: { userId: user.id } }).catch(()=>{})
    await prisma.membershipPlan.deleteMany({ where: { id: plan.id } }).catch(()=>{})
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(()=>{})
    await prisma.$disconnect()
  })

  test('Subscribe creates pending membership and returns subscriptionId', async () => {
    const req = makeNextRequest('http://localhost/api/memberships/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planSlug: plan.slug }) })
    const res = await (Subscribe as any).POST(req)
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(body.subscriptionId).toBeTruthy()
    const membership = await prisma.vIPMembership.findUnique({ where: { subscriptionId: body.subscriptionId } })
    expect(membership?.status).toBe('pending')
  })

  test('Duplicate subscribe blocked', async () => {
    const req = makeNextRequest('http://localhost/api/memberships/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planSlug: plan.slug }) })
    const res = await (Subscribe as any).POST(req)
    expect(res.status).toBe(409)
  })
})
