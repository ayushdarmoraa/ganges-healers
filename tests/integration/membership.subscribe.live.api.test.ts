/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as Subscribe from '@/app/api/memberships/subscribe/route'

// Mock Razorpay SDK used by route.ts at import time
jest.mock('razorpay', () => {
  return function MockRazorpay(this: any) {
    return {
      subscriptions: {
        create: async (args: any) => ({ id: 'sub_mocked_123', short_url: 'https://rzp.io/i/mock123', ...args })
      }
    }
  }
})

describe('Membership Subscribe live path (mocked Razorpay)', () => {
  beforeAll(async () => {
    // ensure vip-monthly exists in DB for lookup
    await prisma.membershipPlan.upsert({
      where: { slug: 'vip-monthly' },
      update: { isActive: true, razorpayPlanId: 'plan_test_live_monthly' },
      create: { slug: 'vip-monthly', title: 'VIP Monthly', pricePaise: 19900, interval: 'MONTHLY', isActive: true, razorpayPlanId: 'plan_test_live_monthly', benefits: { freeSessions: 2 } }
    })
    process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_live_mock_123456'
    process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'secret'
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('returns { id, shortUrl } on success', async () => {
    const req = makeNextRequest('http://localhost/api/memberships/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ planSlug: 'vip-monthly' }) })
    const res = await (Subscribe as any).POST(req)
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(typeof body.id).toBe('string')
    expect(typeof body.shortUrl).toBe('string')
  })
})
