/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'
import { NextRequest } from 'next/server'
import * as Webhook from '@/app/api/payments/webhook/route'

function makeRequestWithRawBody(url: string, bodyText: string, signature?: string) {
  const headers: Record<string,string> = { 'content-type': 'application/json' }
  if (signature) headers['x-razorpay-signature'] = signature
  const req = new NextRequest(new Request(url, { method: 'POST', headers, body: bodyText }) as any)
  return req
}

async function readJSON(res: Response) {
  const clone = res.clone()
  try { return await clone.json() } catch { return null }
}

describe('Razorpay Webhook verification', () => {
  const secret = 'test_webhook_secret_pin'
  const fixture = JSON.stringify({
    event: 'subscription.activated',
    payload: { subscription: { entity: { id: 'sub_test_123', current_start: 1700000000, current_end: 1702592000 } } }
  })

  beforeAll(() => {
    process.env.RAZORPAY_WEBHOOK_SECRET = secret
  })

  test('Invalid signature => 401', async () => {
    const badSig = 'deadbeef'
    const req = makeRequestWithRawBody('http://localhost/api/payments/webhook', fixture, badSig)
    const res = await (Webhook as any).POST(req)
    expect(res.status).toBe(401)
    const body = await readJSON(res)
    expect(body?.ok).toBe(false)
    expect(body?.error).toBe('signature-mismatch')
  })

  test('Valid signature => 200 { ok: true }', async () => {
    const sig = crypto.createHmac('sha256', secret).update(fixture).digest('hex')
    const req = makeRequestWithRawBody('http://localhost/api/payments/webhook', fixture, sig)
    const res = await (Webhook as any).POST(req)
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(body?.ok).toBe(true)
  })
})
