import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { POST as verify } from '@/app/api/payments/verify/route'
import { POST as createOrder } from '@/app/api/payments/create-order/route'
import { POST as enrollProgram } from '@/app/api/programs/[slug]/enroll/route'
import { POST as enrollCourse } from '@/app/api/courses/[slug]/enroll/route'

jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: process.env.TEST_FULFILLMENT_USER_ID, email: 'atomic@example.test', role: 'USER' } }),
}))
jest.mock('@/lib/analytics/session', () => ({ getSessionId: async () => null, getExperimentVariants: async () => ({}) }))
jest.mock('@/lib/razorpay', () => ({
  getRazorpayClient: jest.fn(async () => ({ orders: {
    create: async (data: { amount: number; currency: string }) => ({ id: `order_${crypto.randomUUID()}`, ...data }),
  } })),
}))

let userId: string
const programIds: string[] = []
const courseIds: string[] = []
const productIds: string[] = []
const request = (body: unknown) => new Request('http://localhost/api/payments', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

async function verifyOrder(orderId: string, paymentId = `pay_${crypto.randomUUID()}`) {
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`).digest('hex')
  return verify(request({ orderId, paymentId, signature }))
}

async function program() {
  const row = await prisma.program.create({ data: {
    slug: `atomic-${crypto.randomUUID()}`, title: 'Atomic Program', description: 'Test program',
    pricePaise: 25000, totalSessions: 3, sessionsPerWeek: 2, durationMinutes: 60,
  } })
  programIds.push(row.id)
  return row
}

async function product(stockCount = 3) {
  const row = await prisma.product.create({ data: {
    slug: `atomic-${crypto.randomUUID()}`, title: 'Atomic Tool', pricePaise: 1000, stockCount,
  } })
  productIds.push(row.id)
  return row
}

async function storePurchase(productId: string, quantity = 1) {
  const order = await prisma.order.create({ data: {
    userId, totalPaise: 1000 * quantity,
    items: { create: { productId, quantity, pricePaise: 1000 * quantity } },
  } })
  const payment = await prisma.payment.create({ data: {
    userId, type: 'STORE', gateway: 'razorpay', currency: 'INR', amountPaise: order.totalPaise,
    status: 'pending', statusEnum: 'PENDING', gatewayOrderId: `order_${crypto.randomUUID()}`,
    metadata: { orderId: order.id },
  } })
  return { order, payment }
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: `atomic-${crypto.randomUUID()}@example.test`, password: 'unused', role: 'USER' } })
  userId = user.id
  process.env.TEST_FULFILLMENT_USER_ID = userId
})

afterAll(async () => {
  if (userId) await prisma.user.delete({ where: { id: userId } })
  await prisma.program.deleteMany({ where: { id: { in: programIds } } })
  await prisma.course.deleteMany({ where: { id: { in: courseIds } } })
  await prisma.product.deleteMany({ where: { id: { in: productIds } } })
  delete process.env.TEST_FULFILLMENT_USER_ID
  await prisma.$disconnect()
})

test('program checkout honors its agreed price after the catalog changes', async () => {
  const p = await program()
  const response = await enrollProgram(request({}), { params: Promise.resolve({ slug: p.slug }) })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } })).pricePaise).toBe(25000)
  await prisma.program.update({ where: { id: p.id }, data: { pricePaise: 90000 } })
  expect((await verifyOrder(body.orderId)).status).toBe(200)
  expect((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } })).status).toBe('active')
})

test('course checkout honors its agreed price after the catalog changes', async () => {
  const course = await prisma.course.create({ data: { slug: `atomic-${crypto.randomUUID()}`, title: 'Atomic Course', description: 'Test', pricePaise: 15000 } })
  courseIds.push(course.id)
  const response = await enrollCourse(request({}), { params: Promise.resolve({ slug: course.slug }) })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect((await prisma.courseEnrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } })).pricePaise).toBe(15000)
  await prisma.course.update({ where: { id: course.id }, data: { pricePaise: 80000 } })
  expect((await verifyOrder(body.orderId)).status).toBe(200)
  expect((await prisma.courseEnrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } })).status).toBe('active')
})

test('insufficient stock rolls back payment and order; a retry fulfills exactly once', async () => {
  const item = await product(1)
  const { order, payment } = await storePurchase(item.id, 2)
  const gatewayPaymentId = `pay_${crypto.randomUUID()}`
  expect((await verifyOrder(payment.gatewayOrderId!, gatewayPaymentId)).status).toBe(409)
  expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).statusEnum).toBe('PENDING')
  expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('pending_payment')
  expect((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stockCount).toBe(1)
  await prisma.product.update({ where: { id: item.id }, data: { stockCount: 2 } })
  expect((await verifyOrder(payment.gatewayOrderId!, gatewayPaymentId)).status).toBe(200)
  expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid')
  expect((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stockCount).toBe(0)
  const replay = await verifyOrder(payment.gatewayOrderId!, gatewayPaymentId)
  expect(await replay.json()).toEqual({ verified: true, idempotent: true })
  expect((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stockCount).toBe(0)
})

test('concurrent orders cannot both consume the last counted item', async () => {
  const item = await product(1)
  const first = await storePurchase(item.id)
  const second = await storePurchase(item.id)
  const responses = await Promise.all([verifyOrder(first.payment.gatewayOrderId!), verifyOrder(second.payment.gatewayOrderId!)])
  expect(responses.map(r => r.status).sort()).toEqual([200, 409])
  expect((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stockCount).toBe(0)
  expect(await prisma.payment.count({ where: { id: { in: [first.payment.id, second.payment.id] }, statusEnum: 'SUCCESS' } })).toBe(1)
  expect(await prisma.order.count({ where: { id: { in: [first.order.id, second.order.id] }, status: 'paid' } })).toBe(1)
})

test('simultaneous callbacks for one payment decrement inventory once', async () => {
  const item = await product(3)
  const { payment } = await storePurchase(item.id)
  const gatewayPaymentId = `pay_${crypto.randomUUID()}`
  const responses = await Promise.all([verifyOrder(payment.gatewayOrderId!, gatewayPaymentId), verifyOrder(payment.gatewayOrderId!, gatewayPaymentId)])
  expect(responses.map(r => r.status)).toEqual([200, 200])
  const bodies = await Promise.all(responses.map(r => r.json()))
  expect(bodies.filter(b => b.idempotent === true)).toHaveLength(1)
  expect((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stockCount).toBe(2)
  expect(await prisma.invoice.count({ where: { paymentId: payment.id } })).toBe(1)
})

test('repairs a legacy successful payment whose fulfillment did not complete', async () => {
  const item = await product(3)
  const { order, payment } = await storePurchase(item.id)
  const gatewayPaymentId = `pay_${crypto.randomUUID()}`
  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'success', statusEnum: 'SUCCESS', gatewayPaymentId } })
  expect((await verifyOrder(payment.gatewayOrderId!, gatewayPaymentId)).status).toBe(200)
  expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('paid')
  expect((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stockCount).toBe(2)
  expect((await verifyOrder(payment.gatewayOrderId!, gatewayPaymentId)).status).toBe(200)
  expect((await prisma.product.findUniqueOrThrow({ where: { id: item.id } })).stockCount).toBe(2)
})

test('a paid session confirms its pending booking in the payment transaction', async () => {
  const [service, healer] = await Promise.all([prisma.service.findFirstOrThrow(), prisma.healer.findFirstOrThrow()])
  const booking = await prisma.booking.create({ data: {
    userId, healerId: healer.id, serviceId: service.id, scheduledAt: new Date(Date.now() + 20 * 86400000),
    durationMin: service.duration, pricePaise: 25000,
  } })
  const payment = await prisma.payment.create({ data: {
    userId, bookingId: booking.id, type: 'SESSION', amountPaise: 25000, gateway: 'razorpay',
    status: 'pending', statusEnum: 'PENDING', currency: 'INR', gatewayOrderId: `order_${crypto.randomUUID()}`,
  } })
  expect((await verifyOrder(payment.gatewayOrderId!)).status).toBe(200)
  expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('CONFIRMED')
})

test('freezes a legacy pending quote and reuses its gateway order on retry', async () => {
  const p = await program()
  const enrollment = await prisma.programEnrollment.create({ data: { userId, programId: p.id } })
  const gateway = jest.requireMock<{ getRazorpayClient: jest.Mock }>('@/lib/razorpay').getRazorpayClient
  gateway.mockClear()
  const body = { type: 'PROGRAM', metadata: { enrollmentId: enrollment.id } }
  const first = await createOrder(request(body))
  expect(first.status).toBe(200)
  const quote = await first.json()
  expect((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).pricePaise).toBe(25000)
  await prisma.program.update({ where: { id: p.id }, data: { pricePaise: 90000 } })
  const retry = await createOrder(request(body))
  expect(retry.status).toBe(200)
  expect(await retry.json()).toEqual(quote)
  expect(gateway).toHaveBeenCalledTimes(1)
})
