/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as Enroll from '@/app/api/programs/[programId]/enroll/route'
import * as Verify from '@/app/api/payments/verify/route'
import * as Webhook from '@/app/api/payments/webhook/route'

jest.mock('@/lib/auth', () => ({
  auth: async () => {
    if (!process.env.TEST_USER_ID) return { user: null }
    return { user: {
      id: process.env.TEST_USER_ID,
      role: 'USER',
      vip: false,
      freeSessionCredits: 0,
      email: 'program@example.com'
    } }
  }
}))

// Mock Razorpay client used inside enroll endpoint
jest.mock('@/lib/razorpay', () => ({
  getRazorpayClient: async () => ({
    orders: { create: async (args: any) => ({ id: 'order_prog_' + Date.now(), ...args }) }
  })
}))

jest.setTimeout(45000)

describe('Program Enrollment Payments', () => {
  let user: any
  let program: any
  let enrollmentId: string
  let orderId: string
  let paymentRecord: any

  beforeAll(async () => {
    // create user
    user = await prisma.user.create({ data: { email: `prog_user_${Date.now()}@ex.com`, password: 'x', role: 'USER' } })
    process.env.TEST_USER_ID = user.id
    // create program
    program = await prisma.program.create({
      data: {
        slug: 'stress-relief-' + Date.now(),
        title: 'Stress Relief Program',
        description: 'A multi-week stress relief course',
        pricePaise: 250000,
        totalSessions: 6,
        sessionsPerWeek: 3,
        durationMinutes: 45,
        isActive: true,
      }
    })
  })

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { metadata: { path: ['enrollmentId'], string_contains: enrollmentId || '' } } }).catch(()=>{})
    await prisma.programEnrollment.deleteMany({ where: { id: enrollmentId } }).catch(()=>{})
    await prisma.program.deleteMany({ where: { id: program?.id } }).catch(()=>{})
    await prisma.user.deleteMany({ where: { id: user?.id } }).catch(()=>{})
    await prisma.$disconnect()
  })

  test('Enroll happy path creates pending enrollment + order', async () => {
    const req = makeNextRequest(`http://localhost/api/programs/${program.id}/enroll`, { method: 'POST', headers: { 'content-type': 'application/json' } })
    const res = await (Enroll as any).POST(req, { params: Promise.resolve({ programId: program.id }) })
    expect(res.status).toBeLessThan(300)
    const body = await readJSON(res)
    orderId = body.orderId
    enrollmentId = body.enrollmentId
    expect(orderId).toBeTruthy()
    expect(enrollmentId).toBeTruthy()
    const enr = await prisma.programEnrollment.findUnique({ where: { id: enrollmentId } })
    expect(enr?.status).toBe('pending_payment')
    paymentRecord = await prisma.payment.findFirst({ where: { gatewayOrderId: orderId } })
    expect(paymentRecord?.type).toBe('PROGRAM')
  })

  test('Verify activates enrollment and is idempotent', async () => {
    // Build signature for first verify
    const paymentId = 'pay_prog_123'
    const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${paymentId}`).digest('hex')
    const req1 = makeNextRequest('http://localhost/api/payments/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId, paymentId, signature })
    })
    const res = await (Verify as any).POST(req1)
    expect(res.status).toBeLessThan(300)
  const enr = await prisma.programEnrollment.findUnique({ where: { id: enrollmentId } })
    expect(enr?.status).toBe('active')
    expect(Array.isArray(enr?.schedule)).toBe(true)

    // Idempotent second verify
    const req2 = makeNextRequest('http://localhost/api/payments/verify', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId, paymentId, signature })
    })
    const res2 = await (Verify as any).POST(req2)
    expect(res2.status).toBeLessThan(300)
    const enr2 = await prisma.programEnrollment.findUnique({ where: { id: enrollmentId } })
    expect(enr2?.status).toBe('active')
  })

  test('Webhook endpoint accepts captured event (no-op DB side-effects)', async () => {
    // Create a fresh distinct program to avoid duplicate enrollment conflict
    const program2 = await prisma.program.create({
      data: {
        slug: 'webhook-prog-' + Date.now(),
        title: 'Webhook Program',
        description: 'Webhook activation test',
        pricePaise: 180000,
        totalSessions: 4,
        sessionsPerWeek: 2,
        durationMinutes: 30,
        isActive: true,
      }
    })
    const reqEnroll = makeNextRequest(`http://localhost/api/programs/${program2.id}/enroll`, { method: 'POST', headers: { 'content-type': 'application/json' } })
    const resEnroll = await (Enroll as any).POST(reqEnroll, { params: Promise.resolve({ programId: program2.id }) })
    expect(resEnroll.status).toBeLessThan(300)
    const body = await readJSON(resEnroll)
    const newEnrollmentId = body.enrollmentId
    const newOrderId = body.orderId
  const pay = await prisma.payment.findFirst({ where: { gatewayOrderId: newOrderId } })
  expect(pay?.type).toBe('PROGRAM')
  expect((pay?.metadata as any)?.enrollmentId).toBe(newEnrollmentId)
    const payload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_hook_1', order_id: newOrderId } } } }
    const raw = JSON.stringify(payload)
  process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook'
  const sig = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex')
  const webhookReq = new NextRequest(new Request('http://localhost/api/payments/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-razorpay-signature': sig }, body: raw }) as any)
    const webhookRes = await (Webhook as any).POST(webhookReq)
    expect(webhookRes.status).toBeLessThan(300)
    // Current webhook handler validates signature and returns ok; activation is handled by Verify path.
    const enr = await prisma.programEnrollment.findUnique({ where: { id: newEnrollmentId } })
    expect(['pending_payment','active']).toContain(enr?.status)
  })

  test('Unauthorized enroll attempt returns 401', async () => {
    delete process.env.TEST_USER_ID
    const req = makeNextRequest(`http://localhost/api/programs/${program.id}/enroll`, { method: 'POST' })
    const res = await (Enroll as any).POST(req, { params: Promise.resolve({ programId: program.id }) })
    expect(res.status).toBe(401)
    process.env.TEST_USER_ID = user.id
  })
})
