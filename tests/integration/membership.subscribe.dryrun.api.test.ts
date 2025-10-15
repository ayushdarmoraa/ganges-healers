/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as Subscribe from '@/app/api/memberships/subscribe/route'

function post(url: string, body: any) {
  return makeNextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

describe('Membership Subscribe dry-run contract', () => {
  beforeAll(() => {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_1234567890123456'
  })

  test('monthly alias maps to vip-monthly', async () => {
    const req = post('http://localhost/api/memberships/subscribe?dry=1', { planSlug: 'monthly' })
    const res = await (Subscribe as any).POST(req)
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(body.marker).toBe('SUBSCRIBE_V3')
    expect(body.canonical).toBe('vip-monthly')
    expect(typeof body.keyPrefix).toBe('string')
  })

  test('yearly alias maps to vip-yearly', async () => {
    const req = post('http://localhost/api/memberships/subscribe?dry=1', { planSlug: 'yearly' })
    const res = await (Subscribe as any).POST(req)
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(body.marker).toBe('SUBSCRIBE_V3')
    expect(body.canonical).toBe('vip-yearly')
  })

  test('canonical passes through unchanged', async () => {
    const req = post('http://localhost/api/memberships/subscribe?dry=1', { planSlug: 'vip-monthly' })
    const res = await (Subscribe as any).POST(req)
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(body.canonical).toBe('vip-monthly')
  })

  test('unknown slug => 400', async () => {
    const req = post('http://localhost/api/memberships/subscribe?dry=1', { planSlug: 'vip-weekly' })
    const res = await (Subscribe as any).POST(req)
    expect(res.status).toBe(400)
    const body = await readJSON(res)
    expect(body.error).toBe('unknown-plan')
    expect(body.canonical).toBeNull()
  })
})
