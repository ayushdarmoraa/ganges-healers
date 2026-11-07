import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { getRazorpayClient } from '@/lib/razorpay'
import { POST } from '@/app/api/courses/[slug]/enroll/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/razorpay', () => ({ getRazorpayClient: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  course: { findFirst: jest.fn() },
  courseEnrollment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  payment: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(), $executeRaw: jest.fn(),
} }))
const order = jest.fn()
const params = { params: Promise.resolve({ slug: 'course-slug' }) }
const send = (body: unknown = {}) => POST(new Request('https://example.test/api/courses/course-slug/enroll', { method: 'POST', body: JSON.stringify(body) }), params)
const course = { id: 'course', slug: 'course-slug', pricePaise: 15000 }
const enrollment = { id: 'enrollment', userId: 'owner', courseId: 'course', pricePaise: 15000, status: 'pending_payment' }
const payment = { userId: 'owner', type: 'COURSE', gateway: 'razorpay', gatewayOrderId: 'order_saved', currency: 'INR', amountPaise: 15000, status: 'pending', statusEnum: 'PENDING', metadata: { enrollmentId: 'enrollment', courseId: 'course' } }

beforeEach(() => {
  jest.resetAllMocks()
  jest.mocked(auth).mockResolvedValue({ user: { id: 'owner' } } as never)
  jest.mocked(prisma.course.findFirst).mockResolvedValue(course as never)
  jest.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(null)
  jest.mocked(prisma.courseEnrollment.create).mockResolvedValue(enrollment as never)
  jest.mocked(prisma.courseEnrollment.update).mockResolvedValue(enrollment as never)
  jest.mocked(prisma.payment.findFirst).mockResolvedValue(null)
  ;(prisma.$transaction as jest.Mock).mockImplementation((work: (tx: typeof prisma) => Promise<unknown>) => work(prisma))
  jest.mocked(getRazorpayClient).mockResolvedValue({ orders: { create: order } })
  order.mockResolvedValue({ id: 'order_new' })
  process.env.RAZORPAY_KEY_ID = 'public_test_key'
})

test('free enrollment grants server-priced access without a gateway or payment record', async () => {
  jest.mocked(prisma.course.findFirst).mockResolvedValue({ ...course, pricePaise: 0 } as never)
  jest.mocked(getRazorpayClient).mockResolvedValue(null)
  const response = await send({ amountPaise: 100, userId: 'other' })
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ enrolled: true, enrollmentId: 'enrollment', amountPaise: 0 })
  expect(prisma.courseEnrollment.create).toHaveBeenCalledWith({ data: { userId: 'owner', courseId: 'course', pricePaise: 0, status: 'active' } })
  expect(getRazorpayClient).not.toHaveBeenCalled()
  expect(prisma.payment.create).not.toHaveBeenCalled()
})

test('paid checkout retains its public fields and uses a gateway-safe receipt', async () => {
  const response = await send({ amountPaise: 1 })
  expect(await response.json()).toEqual({ orderId: 'order_new', amountPaise: 15000, enrollmentId: 'enrollment', key: 'public_test_key' })
  expect(order).toHaveBeenCalledWith({ amount: 15000, currency: 'INR', receipt: expect.stringMatching(/^course_[a-f0-9]{32}$/), notes: { courseId: 'course', enrollmentId: 'enrollment' } })
  expect(order.mock.calls[0][0].receipt.length).toBeLessThanOrEqual(40)
})

test('missing payment configuration does not reserve a new paid enrollment', async () => {
  jest.mocked(getRazorpayClient).mockResolvedValue(null)
  expect((await send()).status).toBe(500)
  expect(prisma.courseEnrollment.create).not.toHaveBeenCalled()
  expect(order).not.toHaveBeenCalled()
})

test('a retry returns its existing pending order and agreed price after catalog price changes', async () => {
  jest.mocked(prisma.course.findFirst).mockResolvedValue({ ...course, pricePaise: 90000 } as never)
  jest.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(enrollment as never)
  jest.mocked(prisma.payment.findFirst).mockResolvedValue(payment as never)
  const response = await send()
  expect(await response.json()).toEqual({ orderId: 'order_saved', amountPaise: 15000, enrollmentId: 'enrollment', key: 'public_test_key', resumed: true })
  expect(order).not.toHaveBeenCalled()
  expect(prisma.courseEnrollment.create).not.toHaveBeenCalled()
  expect(prisma.payment.create).not.toHaveBeenCalled()
  expect(prisma.payment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner', type: 'COURSE', metadata: { path: ['enrollmentId'], equals: 'enrollment' } } }))
})

test('a legacy pending reservation without an order can retry with its saved quote', async () => {
  jest.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(enrollment as never)
  const response = await send()
  expect(response.status).toBe(200)
  expect(prisma.courseEnrollment.create).not.toHaveBeenCalled()
  expect(order).toHaveBeenCalledWith(expect.objectContaining({ amount: 15000 }))
})

test('a legacy reservation without a price recovers the agreed amount from its own stored payment', async () => {
  jest.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue({ ...enrollment, pricePaise: null } as never)
  jest.mocked(prisma.payment.findFirst).mockResolvedValue(payment as never)
  expect((await send()).status).toBe(200)
  expect(prisma.courseEnrollment.update).toHaveBeenCalledWith({ where: { id: 'enrollment' }, data: { pricePaise: 15000 } })
})

test.each(['active', 'completed'])('an existing %s enrollment cannot create another checkout', async status => {
  jest.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue({ ...enrollment, status } as never)
  const response = await send()
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ enrolled: true, enrollmentId: 'enrollment' })
  expect(order).not.toHaveBeenCalled()
})

test.each([
  { ...payment, statusEnum: 'SUCCESS', status: 'success' },
  { ...payment, currency: 'USD' },
  { ...payment, currency: null },
  { ...payment, amountPaise: 1 },
  { ...payment, metadata: { enrollmentId: 'enrollment', courseId: 'other-course' } },
  { ...payment, gatewayOrderId: null },
])('inconsistent or terminal payments never start another checkout', async saved => {
  jest.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue(enrollment as never)
  jest.mocked(prisma.payment.findFirst).mockResolvedValue(saved as never)
  expect((await send()).status).toBe(409)
  expect(order).not.toHaveBeenCalled()
  expect(prisma.payment.create).not.toHaveBeenCalled()
})

test('a previously agreed free quote can complete even if the catalog is now paid', async () => {
  jest.mocked(prisma.courseEnrollment.findUnique).mockResolvedValue({ ...enrollment, pricePaise: 0 } as never)
  expect((await send()).status).toBe(200)
  expect(prisma.courseEnrollment.update).toHaveBeenCalledWith({ where: { id: 'enrollment' }, data: { status: 'active', pricePaise: 0 } })
  expect(getRazorpayClient).not.toHaveBeenCalled()
})

test('authentication and public activity checks happen before any allocation', async () => {
  jest.mocked(auth).mockResolvedValue(null as never)
  expect((await send()).status).toBe(401)
  jest.mocked(auth).mockResolvedValue({ user: { id: 'owner' } } as never)
  jest.mocked(prisma.course.findFirst).mockResolvedValue(null)
  expect((await send()).status).toBe(404)
  expect(prisma.$transaction).not.toHaveBeenCalled()
})
