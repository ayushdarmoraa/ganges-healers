import { randomUUID, createHmac } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/payments/webhook/route'
import { finalizePayment } from '@/lib/payments/finalize'
import { createAndStoreInvoicePdf } from '@/lib/invoices'
import type { Payment } from '@prisma/client'

jest.mock('@/lib/invoices', () => ({ createAndStoreInvoicePdf: jest.fn(async () => 'https://example.test/invoice.pdf') }))
let userId: string
let productId: string
let orderId: string
let payment: Payment
const secret = 'recovery-test-secret'
function captured(id = `pay_${randomUUID()}`) {
  return { event: 'payment.captured', payload: { payment: { entity: { id, order_id: payment.gatewayOrderId!, amount: payment.amountPaise, currency: 'INR', status: 'captured', notes: { userId: 'not-the-owner' } } } } }
}
async function send(event: unknown) {
  const body = JSON.stringify(event)
  const signature = createHmac('sha256', secret).update(body).digest('hex')
  return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body, headers: { 'x-razorpay-signature': signature } }))
}
beforeEach(async () => {
  jest.clearAllMocks()
  process.env.PAYMENT_EVENTS_ENABLED = 'true'
  process.env.RAZORPAY_WEBHOOK_SECRET = secret
  userId = (await prisma.user.create({ data: { email: `recovery_${randomUUID()}@example.test` } })).id
  productId = (await prisma.product.create({ data: { slug: `recovery_${randomUUID()}`, title: 'Recovery Test', pricePaise: 1000, stockCount: 3 } })).id
  orderId = (await prisma.order.create({ data: { userId, totalPaise: 1000, items: { create: { productId, quantity: 1, pricePaise: 1000 } } } })).id
  payment = await prisma.payment.create({ data: { userId, gateway: 'razorpay', gatewayOrderId: `order_${randomUUID()}`, type: 'STORE', status: 'pending', statusEnum: 'PENDING', currency: 'INR', amountPaise: 1000, metadata: { orderId } } })
})
afterEach(async () => {
  await prisma.user.delete({ where: { id: userId } })
  await prisma.product.delete({ where: { id: productId } })
})
afterAll(async () => { await prisma.$disconnect() })

test('a captured webhook fulfills an owned store purchase with no browser callback', async () => {
  const event = captured()
  expect((await send(event)).status).toBe(200)
  expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ userId, gatewayPaymentId: event.payload.payment.entity.id, gatewaySignature: null, statusEnum: 'SUCCESS' })
  expect(await prisma.order.findUnique({ where: { id: orderId } })).toMatchObject({ status: 'paid' })
  expect(await prisma.product.findUnique({ where: { id: productId } })).toMatchObject({ stockCount: 2 })
  expect(createAndStoreInvoicePdf).toHaveBeenCalledWith(event.payload.payment.entity.id, { force: false })
})

test('simultaneous browser callback and webhook decrement inventory once', async () => {
  const event = captured()
  const paymentId = event.payload.payment.entity.id
  const [response] = await Promise.all([
    send(event),
    finalizePayment({ orderId: payment.gatewayOrderId!, paymentId, userId, signature: 'verified-browser-signature' }),
  ])
  expect(response.status).toBe(200)
  expect((await send(event)).status).toBe(200)
  expect(await prisma.product.findUnique({ where: { id: productId } })).toMatchObject({ stockCount: 2 })
})

test.each(['amount', 'currency', 'status'] as const)('mismatched captured %s cannot grant or invoice access', async key => {
  const event = captured()
  if (key === 'amount') event.payload.payment.entity.amount = 1
  else event.payload.payment.entity[key] = key === 'currency' ? 'USD' : 'authorized'
  expect((await send(event)).status).toBe(500)
  expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ statusEnum: 'PENDING' })
  expect(await prisma.order.findUnique({ where: { id: orderId } })).toMatchObject({ status: 'pending_payment' })
  expect(createAndStoreInvoicePdf).not.toHaveBeenCalled()
})

test('invoice retry after committed fulfillment does not charge stock twice', async () => {
  jest.mocked(createAndStoreInvoicePdf).mockRejectedValueOnce(new Error('temporary storage outage'))
  const event = captured()
  expect((await send(event)).status).toBe(500)
  expect(await prisma.order.findUnique({ where: { id: orderId } })).toMatchObject({ status: 'paid' })
  expect((await send(event)).status).toBe(200)
  expect(await prisma.product.findUnique({ where: { id: productId } })).toMatchObject({ stockCount: 2 })
})

test('out-of-stock failure rolls back payment and a later provider retry can fulfill', async () => {
  await prisma.product.update({ where: { id: productId }, data: { stockCount: 0 } })
  const event = captured()
  expect((await send(event)).status).toBe(500)
  expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toMatchObject({ statusEnum: 'PENDING' })
  await prisma.product.update({ where: { id: productId }, data: { stockCount: 2 } })
  expect((await send(event)).status).toBe(200)
  expect(await prisma.product.findUnique({ where: { id: productId } })).toMatchObject({ stockCount: 1 })
})

test('an unknown gateway order never creates a guessed customer purchase', async () => {
  const event = captured()
  event.payload.payment.entity.order_id = 'order_unknown'
  expect((await send(event)).status).toBe(200)
  expect(await prisma.payment.count({ where: { userId } })).toBe(1)
  expect(createAndStoreInvoicePdf).not.toHaveBeenCalled()
})

test('course access activates directly from a verified captured event', async () => {
  const course = await prisma.course.create({ data: { slug: `recovery_${randomUUID()}`, title: 'Recovery Course', description: 'Test', pricePaise: 15000 } })
  try {
    const enrollment = await prisma.courseEnrollment.create({ data: { userId, courseId: course.id, pricePaise: 15000 } })
    payment = await prisma.payment.create({ data: { userId, gateway: 'razorpay', gatewayOrderId: `order_${randomUUID()}`, type: 'COURSE', status: 'pending', statusEnum: 'PENDING', currency: 'INR', amountPaise: 15000, metadata: { enrollmentId: enrollment.id, courseId: course.id } } })
    expect((await send(captured())).status).toBe(200)
    expect(await prisma.courseEnrollment.findUnique({ where: { id: enrollment.id } })).toMatchObject({ status: 'active' })
  } finally { await prisma.course.delete({ where: { id: course.id } }) }
})
