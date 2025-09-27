/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'
import { makeNextRequest, readJSON } from '../helpers/next-handler'

import * as CreateOrder from '@/app/api/payments/create-order/route'
import * as Verify from '@/app/api/payments/verify/route'
import * as Webhook from '@/app/api/payments/webhook/route'

jest.setTimeout(30000)

jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: process.env.TEST_USER_ID, role: process.env.TEST_USER_ROLE ?? 'USER', email: 'itest@example.com' } })
}))

jest.mock('@/lib/razorpay', () => ({
  getRazorpayClient: async () => ({ orders: { create: async (data: any) => ({ id: 'order_mocked_123', amount: data.amount, currency: data.currency }) } })
}))

describe('Generic Payments Flow', () => {
  let user: any
  let orderId: string
  let paymentRowId: string

  beforeAll(async () => {
    user = await prisma.user.create({ data: { email: `gen_${Date.now()}@ex.com`, password: 'hashed', role: 'USER' } })
    process.env.TEST_USER_ID = user.id
    process.env.TEST_USER_ROLE = 'USER'
  })

  afterAll(async () => {
    if (user?.id) await prisma.user.delete({ where: { id: user.id } }).catch(()=>{})
    await prisma.$disconnect()
  })

  test('create-order generic path', async () => {
    const req = makeNextRequest('http://localhost/api/payments/create-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'SESSION', amountPaise: 1000 })
    })
    const res = await (CreateOrder as any).POST(req)
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(body.orderId).toBeTruthy()
    expect(body.amountPaise).toBe(1000)
    orderId = body.orderId
    paymentRowId = body.paymentId
  })

  test('validate exclusivity (both bookingId and type)', async () => {
    const req = makeNextRequest('http://localhost/api/payments/create-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId: 'ck_fake', type: 'SESSION', amountPaise: 1000 })
    })
    const res = await (CreateOrder as any).POST(req)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  test('validate exclusivity (neither bookingId nor type)', async () => {
    const req = makeNextRequest('http://localhost/api/payments/create-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amountPaise: 1000 })
    })
    const res = await (CreateOrder as any).POST(req)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  test('verify success + idempotency', async () => {
    const gatewayPaymentId = 'pay_simulated_123'
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${gatewayPaymentId}`).digest('hex')
    const req1 = makeNextRequest('http://localhost/api/payments/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId, paymentId: gatewayPaymentId, signature })
    })
    const res1 = await (Verify as any).POST(req1)
    expect(res1.status).toBeLessThan(300)
    const body1 = await readJSON(res1)
    expect(body1.verified).toBe(true)

    const req2 = makeNextRequest('http://localhost/api/payments/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId, paymentId: gatewayPaymentId, signature })
    })
    const res2 = await (Verify as any).POST(req2)
    const body2 = await readJSON(res2)
    expect(body2.idempotent).toBe(true)
  })

  test('webhook captured + failed + refund', async () => {
    expect(paymentRowId).toBeTruthy()
    const capturedPayload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_simulated_123', order_id: orderId, amount: 1000, currency: 'INR' } } } }
    const rawCaptured = JSON.stringify(capturedPayload)
    const sigCaptured = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '').update(rawCaptured).digest('hex')
    const reqCap = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigCaptured }, body: rawCaptured }) as any)
    const resCap = await (Webhook as any).POST(reqCap)
    expect(resCap.status).toBeLessThan(300)

    const failedPayload = { event: 'payment.failed', payload: { payment: { entity: { id: 'pay_failed_1' } } } }
    const rawFailed = JSON.stringify(failedPayload)
    const sigFailed = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '').update(rawFailed).digest('hex')
    const reqFail = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigFailed }, body: rawFailed }) as any)
    const resFail = await (Webhook as any).POST(reqFail)
    expect(resFail.status).toBeLessThan(300)

    const refundPartial = { event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_partial', payment_id: 'pay_simulated_123', amount: 100, status: 'processed', notes: {} } } } }
    const rawRefPart = JSON.stringify(refundPartial)
    const sigRefPart = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '').update(rawRefPart).digest('hex')
    const reqRefPart = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigRefPart }, body: rawRefPart }) as any)
    const resRefPart = await (Webhook as any).POST(reqRefPart)
    expect(resRefPart.status).toBeLessThan(300)

    const paymentRecord = paymentRowId ? await prisma.payment.findUnique({ where: { id: paymentRowId } }) : null
    const fullRefund = { event: 'refund.processed', payload: { refund: { entity: { id: 'rfnd_full', payment_id: 'pay_simulated_123', amount: paymentRecord?.amountPaise, status: 'processed', notes: {} } } } }
    const rawRefFull = JSON.stringify(fullRefund)
    const sigRefFull = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET || '').update(rawRefFull).digest('hex')
    const reqRefFull = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sigRefFull }, body: rawRefFull }) as any)
    const resRefFull = await (Webhook as any).POST(reqRefFull)
    expect(resRefFull.status).toBeLessThan(300)

    const refreshed = await prisma.payment.findUnique({ where: { id: paymentRowId } })
    expect(refreshed?.statusEnum === 'REFUNDED' || refreshed?.status === 'refunded').toBe(true)
  })
})
