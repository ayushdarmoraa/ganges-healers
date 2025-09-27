/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as CreateOrder from '@/app/api/payments/create-order/route'
import * as Verify from '@/app/api/payments/verify/route'
import * as GetInvoice from '@/app/api/invoices/[paymentId]/route'
import * as GenerateInvoice from '@/app/api/invoices/generate/route'
import * as ListMine from '@/app/api/invoices/me/route'

jest.setTimeout(30000)

// Auth mock – single test user
jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: process.env.TEST_INV_USER_ID, role: 'USER', email: 'invoice@example.com' } })
}))

// Razorpay orders mock
jest.mock('@/lib/razorpay', () => ({
  getRazorpayClient: async () => ({ orders: { create: async (data: any) => ({ id: 'order_inv_' + Date.now(), amount: data.amount, currency: data.currency }) } })
}))

describe('Invoices Generation Flow', () => {
  let user: any
  let paymentId: string
  let orderId: string

  beforeAll(async () => {
    user = await prisma.user.create({ data: { email: `inv_${Date.now()}@ex.com`, password: 'x', role: 'USER', name: 'Invoice User' } })
    process.env.TEST_INV_USER_ID = user.id
  })

  afterAll(async () => {
    if (paymentId) await prisma.invoice.deleteMany({ where: { paymentId } }).catch(()=>{})
    if (paymentId) await prisma.payment.deleteMany({ where: { id: paymentId } }).catch(()=>{})
    await prisma.user.deleteMany({ where: { id: user.id } }).catch(()=>{})
    await prisma.$disconnect()
  })

  test('create order, verify -> auto invoice generated', async () => {
    // Create generic payment order
    const reqCreate = makeNextRequest('http://localhost/api/payments/create-order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'SESSION', amountPaise: 12345 })
    })
    const resCreate = await (CreateOrder as any).POST(reqCreate)
    expect(resCreate.status).toBeLessThan(300)
    const bodyCreate = await readJSON(resCreate)
    orderId = bodyCreate.orderId
    paymentId = bodyCreate.paymentId
    expect(orderId).toBeTruthy()
    expect(paymentId).toBeTruthy()

    // Verify (marks success & triggers async invoice)
    const gatewayPaymentId = 'pay_inv_' + Date.now()
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${orderId}|${gatewayPaymentId}`).digest('hex')
    const reqVerify = makeNextRequest('http://localhost/api/payments/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId, paymentId: gatewayPaymentId, signature })
    })
    const resVerify = await (Verify as any).POST(reqVerify)
    expect(resVerify.status).toBeLessThan(300)

    // Poll for invoice creation (as generation is fire-and-forget)
    let invoice: any = null
    for (let i = 0; i < 15; i++) {
      invoice = await prisma.invoice.findUnique({ where: { paymentId } })
      if (invoice) break
      await new Promise(r => setTimeout(r, 200))
    }
    expect(invoice).toBeTruthy()
    expect(invoice.totalPaise).toBe(12345)
  })

  test('GET /api/invoices/[paymentId] returns invoice', async () => {
    const req = makeNextRequest(`http://localhost/api/invoices/${paymentId}`)
    const res = await (GetInvoice as any).GET(req, { params: { paymentId } })
    expect(res.status).toBe(200)
    const body = await readJSON(res)
    expect(body.invoice.invoiceNumber).toMatch(/^INV-/)
  })

  test('GET /api/invoices/me lists invoice', async () => {
    const req = makeNextRequest('http://localhost/api/invoices/me')
    const res = await (ListMine as any).GET(req)
    expect(res.status).toBe(200)
    const body = await readJSON(res)
    expect(Array.isArray(body.invoices)).toBe(true)
    expect(body.invoices.find((i: any) => i.paymentId === paymentId)).toBeTruthy()
  })

  test('POST /api/invoices/generate idempotent (returns existing)', async () => {
    const req = makeNextRequest('http://localhost/api/invoices/generate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paymentId })
    })
    const res = await (GenerateInvoice as any).POST(req)
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    expect(body.ok).toBe(true)
    // When idempotent path hit we either have idempotent flag or just the invoice
    if (body.idempotent !== undefined) {
      expect(body.idempotent).toBe(true)
    } else {
      // Accept either; at minimum invoice should match
      expect(body.invoice.paymentId).toBe(paymentId)
    }
  })
})
