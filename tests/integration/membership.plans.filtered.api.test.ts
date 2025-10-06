/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma'
import * as Plans from '@/app/api/memberships/plans/route'
import { readJSON } from '../helpers/next-handler'

// No auth needed for plans endpoint

describe('Membership Plans (filtered vip-monthly/yearly)', () => {

  beforeAll(async () => {
    // Ensure required plans exist (idempotent upserts)
    await prisma.membershipPlan.upsert({
      where: { slug: 'vip-monthly' },
      update: {},
      create: { slug: 'vip-monthly', title: 'VIP Monthly', pricePaise: 19900, interval: 'MONTHLY', razorpayPlanId: 'plan_monthly_test_filtered', benefits: { freeSessions: 2 } }
    })
    await prisma.membershipPlan.upsert({
      where: { slug: 'vip-yearly' },
      update: {},
      create: { slug: 'vip-yearly', title: 'VIP Yearly', pricePaise: 199000, interval: 'YEARLY', razorpayPlanId: 'plan_yearly_test_filtered', benefits: { freeSessions: 24 } }
    })
  }, 20000)

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('returns only the two vip plans with normalized benefits', async () => {
    const res = await (Plans as any).GET()
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(Array.isArray(body.plans)).toBe(true)
    expect(body.plans.length).toBeLessThanOrEqual(2)
    const slugs = body.plans.map((p: any) => p.slug).sort()
    expect(slugs).toEqual(['vip-monthly', 'vip-yearly'])
    for (const p of body.plans) {
      expect(p.benefits).toBeTruthy()
      expect(typeof p.benefits).toBe('object')
      expect(p.benefits.freeSessions).toBeDefined()
      expect(typeof p.benefits.freeSessions).toBe('number')
    }
  }, 15000)
})
