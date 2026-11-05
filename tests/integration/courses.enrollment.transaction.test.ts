import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { POST } from '@/app/api/courses/[slug]/enroll/route'
import { POST as genericCheckout } from '@/app/api/payments/create-order/route'
import { getRazorpayClient } from '@/lib/razorpay'

let mockActor = ''
const mockCreateOrder = jest.fn(async (input: { amount: number }) => ({ id: `order_${randomUUID()}`, ...input }))
jest.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: mockActor } }) }))
jest.mock('@/lib/razorpay', () => ({ getRazorpayClient: jest.fn(async () => ({ orders: { create: mockCreateOrder } })) }))
let userId = ''
const courses: string[] = []
async function course(pricePaise = 15000) {
  const row = await prisma.course.create({ data: { slug: `checkout-${randomUUID()}`, title: 'Checkout Course', description: 'Test', pricePaise } })
  courses.push(row.id)
  return row
}
function send(slug: string) { return POST(new Request('http://localhost/api/courses/enroll', { method: 'POST' }), { params: Promise.resolve({ slug }) }) }

beforeAll(async () => { userId = (await prisma.user.create({ data: { email: `course-checkout-${randomUUID()}@example.test` } })).id })
beforeEach(() => {
  mockActor = userId
  mockCreateOrder.mockClear()
  mockCreateOrder.mockImplementation(async input => ({ id: `order_${randomUUID()}`, ...input }))
  jest.mocked(getRazorpayClient).mockResolvedValue({ orders: { create: mockCreateOrder } })
})
afterAll(async () => {
  try {
    if (userId) await prisma.user.delete({ where: { id: userId } })
    await prisma.course.deleteMany({ where: { id: { in: courses } } })
  } finally { await prisma.$disconnect() }
})

test('concurrent free requests grant one enrollment without invoking a payment service', async () => {
  const row = await course(0)
  jest.mocked(getRazorpayClient).mockResolvedValue(null)
  const responses = await Promise.all([send(row.slug), send(row.slug)])
  expect(responses.map(response => response.status).sort()).toEqual([200, 409])
  expect(await prisma.courseEnrollment.count({ where: { userId, courseId: row.id } })).toBe(1)
  expect(await prisma.courseEnrollment.findUniqueOrThrow({ where: { userId_courseId: { userId, courseId: row.id } } })).toMatchObject({ status: 'active', pricePaise: 0 })
  expect(mockCreateOrder).not.toHaveBeenCalled()
})

test('concurrent paid requests reuse one saved enrollment, quote and provider order', async () => {
  const row = await course()
  const responses = await Promise.all([send(row.slug), send(row.slug)])
  expect(responses.map(response => response.status)).toEqual([200, 200])
  const [first, second] = await Promise.all(responses.map(response => response.json()))
  expect(first.orderId).toBe(second.orderId)
  expect(first.enrollmentId).toBe(second.enrollmentId)
  expect(mockCreateOrder).toHaveBeenCalledTimes(1)
  expect(await prisma.payment.count({ where: { userId, gatewayOrderId: first.orderId } })).toBe(1)
  expect(await prisma.courseEnrollment.count({ where: { userId, courseId: row.id } })).toBe(1)
})

test('resuming dismissed checkout preserves its saved price after a catalog change', async () => {
  const row = await course()
  const initial = await (await send(row.slug)).json()
  await prisma.course.update({ where: { id: row.id }, data: { pricePaise: 80000 } })
  const retry = await send(row.slug)
  expect(retry.status).toBe(200)
  expect(await retry.json()).toMatchObject({ orderId: initial.orderId, enrollmentId: initial.enrollmentId, amountPaise: 15000, resumed: true })
  expect(mockCreateOrder).toHaveBeenCalledTimes(1)
})

test('missing gateway configuration does not leave an enrollment that blocks a later retry', async () => {
  const row = await course()
  jest.mocked(getRazorpayClient).mockResolvedValueOnce(null)
  expect((await send(row.slug)).status).toBe(500)
  expect(await prisma.courseEnrollment.count({ where: { userId, courseId: row.id } })).toBe(0)
  expect((await send(row.slug)).status).toBe(200)
})

test('a gateway error rolls back allocation so a new request can try again', async () => {
  const row = await course()
  mockCreateOrder.mockRejectedValueOnce(new Error('Gateway unavailable'))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    expect((await send(row.slug)).status).toBe(500)
    expect(await prisma.courseEnrollment.count({ where: { userId, courseId: row.id } })).toBe(0)
    expect((await send(row.slug)).status).toBe(200)
  } finally { log.mockRestore() }
})

test('an older pending reservation without an order can continue without another enrollment', async () => {
  const row = await course(80000)
  const saved = await prisma.courseEnrollment.create({ data: { userId, courseId: row.id, pricePaise: 15000, status: 'pending_payment' } })
  const response = await send(row.slug)
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ enrollmentId: saved.id, amountPaise: 15000 })
  expect(await prisma.courseEnrollment.count({ where: { userId, courseId: row.id } })).toBe(1)
})

test('generic payment checkout and course retry cannot persist competing orders for one purchase', async () => {
  const row = await course()
  const saved = await prisma.courseEnrollment.create({ data: { userId, courseId: row.id, pricePaise: 15000, status: 'pending_payment' } })
  const responses = await Promise.all([
    send(row.slug),
    genericCheckout(new Request('http://localhost/api/payments/create-order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'COURSE', metadata: { courseId: row.id, enrollmentId: saved.id } }),
    })),
  ])
  expect(responses.map(response => response.status)).toEqual([200, 200])
  const bodies = await Promise.all(responses.map(response => response.json()))
  expect(bodies[0].orderId).toBe(bodies[1].orderId)
  expect(await prisma.payment.count({ where: { userId, type: 'COURSE', metadata: { path: ['enrollmentId'], equals: saved.id } } })).toBe(1)
})
