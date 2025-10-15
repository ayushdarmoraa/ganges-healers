/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma'
import * as Plans from '@/app/api/memberships/plans/route'
import { readJSON } from '../helpers/next-handler'

describe('Membership Plans API contract', () => {
  beforeAll(async () => {
    await prisma.membershipPlan.upsert({
      where: { slug: 'vip-monthly' },
      update: { isActive: true, pricePaise: 19900, interval: 'MONTHLY', benefits: { freeSessions: 2 } },
      create: { slug: 'vip-monthly', title: 'VIP Monthly', isActive: true, pricePaise: 19900, interval: 'MONTHLY', razorpayPlanId: 'plan_RNJHCpbWJ6TwcH', benefits: { freeSessions: 2 } }
    })
    await prisma.membershipPlan.upsert({
      where: { slug: 'vip-yearly' },
      update: { isActive: true, pricePaise: 199000, interval: 'YEARLY', benefits: { freeSessions: 24 } },
      create: { slug: 'vip-yearly', title: 'VIP Yearly', isActive: true, pricePaise: 199000, interval: 'YEARLY', razorpayPlanId: 'plan_RQ8lRhJvV5jTdX', benefits: { freeSessions: 24 } }
    })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('returns exactly the two canonical plans, price ascending, with normalized benefits', async () => {
    const res = await (Plans as any).GET()
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    const plans = body.plans as any[]
    expect(Array.isArray(plans)).toBe(true)
    expect(plans.length).toBeLessThanOrEqual(2)
    const slugs = plans.map(p => p.slug).sort()
    expect(slugs).toEqual(['vip-monthly', 'vip-yearly'])
    // price ascending
    for (let i=1;i<plans.length;i++) {
      expect(plans[i-1].pricePaise).toBeLessThanOrEqual(plans[i].pricePaise)
    }
    // benefits normalization
    for (const p of plans) {
      expect(typeof p.benefits?.freeSessions).toBe('number')
    }
  })
})
