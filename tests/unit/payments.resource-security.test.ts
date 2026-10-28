import crypto from 'crypto'
import { POST as createOrder } from '@/app/api/payments/create-order/route'
import { POST as verifyPayment } from '@/app/api/payments/verify/route'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  booking: { findUnique: jest.fn() },
  programEnrollment: { findUnique: jest.fn() },
  courseEnrollment: { findUnique: jest.fn() },
  order: { findUnique: jest.fn() },
  payment: { create: jest.fn(), upsert: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
} }))
jest.mock('@/lib/razorpay', () => ({ getRazorpayClient: jest.fn() }))
jest.mock('@/lib/payments/activateProgramEnrollment', () => ({ activateProgramEnrollment: jest.fn() }))
jest.mock('@/lib/payments/activateCourseEnrollment', () => ({ activateCourseEnrollment: jest.fn() }))
jest.mock('@/lib/payments/activateStoreOrder', () => ({ activateStoreOrder: jest.fn() }))
jest.mock('@/lib/invoices/generate', () => ({ generateInvoiceForPayment: jest.fn() }))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/analytics/track-event', () => ({ trackEvent: jest.fn() }))
jest.mock('@/lib/analytics/session', () => ({ getSessionId: jest.fn(), getExperimentVariants: jest.fn() }))

const db = jest.requireMock<{ prisma: Record<string, Record<string, jest.Mock>> }>('@/lib/prisma').prisma
const mockAuth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const mockGateway = jest.requireMock<{ getRazorpayClient: jest.Mock }>('@/lib/razorpay').getRazorpayClient
const activateProgram = jest.requireMock<{ activateProgramEnrollment: jest.Mock }>('@/lib/payments/activateProgramEnrollment').activateProgramEnrollment
const activateCourse = jest.requireMock<{ activateCourseEnrollment: jest.Mock }>('@/lib/payments/activateCourseEnrollment').activateCourseEnrollment
const activateStore = jest.requireMock<{ activateStoreOrder: jest.Mock }>('@/lib/payments/activateStoreOrder').activateStoreOrder
const analytics = jest.requireMock<{ getSessionId: jest.Mock; getExperimentVariants: jest.Mock }>('@/lib/analytics/session')
const trackEvent = jest.requireMock<{ trackEvent: jest.Mock }>('@/lib/analytics/track-event').trackEvent
const activity = jest.requireMock<{ logActivity: jest.Mock }>('@/lib/activity-log').logActivity
const gatewayCreate = jest.fn()
const bookingId = 'ck123456789012345678901234'
const payment = {
  id: 'payment-row', userId: 'buyer', type: 'STORE', bookingId: null,
  gateway: 'razorpay', currency: 'INR', amountPaise: 25000,
  status: 'pending', statusEnum: 'PENDING', metadata: { orderId: 'owned-order' },
  gatewayOrderId: 'order_trusted', gatewayPaymentId: null,
}

function request(body: unknown) {
  return new Request('http://localhost/api/payments', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

function signedRequest(paymentId = 'pay_trusted') {
  const orderId = payment.gatewayOrderId
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`).digest('hex')
  return request({ orderId, paymentId, signature })
}

function expectNoFulfillment() {
  expect(db.payment.update).not.toHaveBeenCalled()
  expect(activateProgram).not.toHaveBeenCalled()
  expect(activateCourse).not.toHaveBeenCalled()
  expect(activateStore).not.toHaveBeenCalled()
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'test', TEST_MODE: '0' })
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  mockAuth.mockResolvedValue({ user: { id: 'buyer', email: 'buyer@example.test' } })
  mockGateway.mockResolvedValue({ orders: { create: gatewayCreate } })
  gatewayCreate.mockResolvedValue({ id: payment.gatewayOrderId })
  db.payment.create.mockResolvedValue(payment)
  db.payment.upsert.mockResolvedValue({ ...payment, type: 'SESSION' })
  db.payment.findFirst.mockResolvedValue(payment)
  db.payment.update.mockImplementation(async ({ data }) => ({ ...payment, ...data }))
  db.booking.findUnique.mockResolvedValue({ id: bookingId, userId: 'buyer', pricePaise: 25000, status: 'PENDING', payment: null })
  db.order.findUnique.mockResolvedValue({ id: 'owned-order', userId: 'buyer', totalPaise: 25000, status: 'pending_payment' })
  db.programEnrollment.findUnique.mockResolvedValue({
    id: 'enrollment', userId: 'buyer', programId: 'program', healerId: 'healer', status: 'pending_payment',
    program: { pricePaise: 25000, isActive: true },
  })
  db.courseEnrollment.findUnique.mockResolvedValue({
    id: 'enrollment', userId: 'buyer', courseId: 'course', status: 'pending_payment',
    course: { pricePaise: 25000, isActive: true },
  })
  analytics.getSessionId.mockResolvedValue(null)
  analytics.getExperimentVariants.mockResolvedValue({})
  trackEvent.mockResolvedValue(undefined)
  activity.mockResolvedValue(undefined)
})
afterEach(() => jest.restoreAllMocks())

describe('server-priced order creation', () => {
  test.each([
    [{ bookingId }, { bookingId }],
    [{ type: 'PROGRAM', metadata: { enrollmentId: 'enrollment', arbitrary: 'discard' } }, { enrollmentId: 'enrollment', programId: 'program', healerId: 'healer' }],
    [{ type: 'COURSE', metadata: { enrollmentId: 'enrollment' } }, { enrollmentId: 'enrollment', courseId: 'course' }],
    [{ type: 'STORE', metadata: { orderId: 'owned-order', arbitrary: 'discard' } }, { orderId: 'owned-order' }],
  ])('prices an owned resource and stores only canonical metadata: %j', async (body, metadata) => {
    const response = await createOrder(request(body))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ orderId: payment.gatewayOrderId, amountPaise: 25000, currency: 'INR', paymentId: payment.id })
    expect(gatewayCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 25000, currency: 'INR', notes: metadata }))
    const write = 'bookingId' in body ? db.payment.upsert.mock.calls[0][0].create : db.payment.create.mock.calls[0][0].data
    expect(write).toMatchObject({ userId: 'buyer', amountPaise: 25000, metadata })
  })

  test.each(['SESSION', 'PROGRAM', 'COURSE', 'STORE', 'MEMBERSHIP'])('rejects unbound %s payments before reaching the gateway', async type => {
    const response = await createOrder(request({ type, amountPaise: 1 }))
    expect(response.status).toBe(400)
    expect(gatewayCreate).not.toHaveBeenCalled()
    expect(db.payment.create).not.toHaveBeenCalled()
  })

  test.each(['booking', 'programEnrollment', 'courseEnrollment', 'order'])('rejects another user’s %s', async model => {
    db[model].findUnique.mockResolvedValue({ userId: 'victim' })
    const body = model === 'booking' ? { bookingId }
      : model === 'order' ? { type: 'STORE', metadata: { orderId: 'victim-order' } }
        : { type: model === 'programEnrollment' ? 'PROGRAM' : 'COURSE', metadata: { enrollmentId: 'victim-enrollment' } }
    expect((await createOrder(request(body))).status).toBe(403)
    expect(gatewayCreate).not.toHaveBeenCalled()
  })

  test('rejects a client-supplied lower price', async () => {
    expect((await createOrder(request({ type: 'STORE', amountPaise: 1, metadata: { orderId: 'owned-order' } }))).status).toBe(400)
    expect(gatewayCreate).not.toHaveBeenCalled()
  })

  test.each([{ programId: 'different-program' }, { healerId: 'different-healer' }])('rejects conflicting fulfillment bindings: %j', async metadata => {
    const response = await createOrder(request({ type: 'PROGRAM', metadata: { enrollmentId: 'enrollment', ...metadata } }))
    expect(response.status).toBe(400)
    expect(gatewayCreate).not.toHaveBeenCalled()
  })

  test('does not reopen an already paid booking', async () => {
    db.booking.findUnique.mockResolvedValue({ userId: 'buyer', status: 'CONFIRMED', payment: { statusEnum: 'SUCCESS' } })
    expect((await createOrder(request({ bookingId }))).status).toBe(409)
    expect(db.payment.upsert).not.toHaveBeenCalled()
    expect(gatewayCreate).not.toHaveBeenCalled()
  })

  test.each(['active', 'cancelled'])('does not charge a %s enrollment', async status => {
    db.courseEnrollment.findUnique.mockResolvedValue({ userId: 'buyer', courseId: 'course', status, course: { isActive: true, pricePaise: 25000 } })
    expect((await createOrder(request({ type: 'COURSE', metadata: { enrollmentId: 'enrollment' } }))).status).toBe(409)
    expect(gatewayCreate).not.toHaveBeenCalled()
  })
})

describe('payment verification trust boundary', () => {
  test('rejects unsigned requests even with test flags accidentally set in production', async () => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'production', TEST_MODE: '1', NEXT_PUBLIC_TEST_MODE: '1' })
    const response = await verifyPayment(request({ orderId: payment.gatewayOrderId, paymentId: 'pay_trusted', signature: 'invalid_signature' }))
    expect(response.status).toBe(400)
    expect(db.payment.findFirst).not.toHaveBeenCalled()
    expectNoFulfillment()
  })

  test('fails closed without a signing secret', async () => {
    const req = signedRequest()
    delete process.env.RAZORPAY_KEY_SECRET
    expect((await verifyPayment(req)).status).toBe(500)
    expectNoFulfillment()
  })

  test.each([
    [{ userId: 'victim' }, 403],
    [{ amountPaise: 1 }, 400],
    [{ currency: 'USD' }, 400],
    [{ gateway: 'vip_credit' }, 400],
    [{ status: 'refunded', statusEnum: 'REFUNDED' }, 409],
    [{ type: 'SESSION', bookingId: null }, 400],
    [{ type: 'PROGRAM', metadata: { enrollmentId: 'enrollment', programId: 'wrong-program' } }, 400],
  ])('rejects unsafe stored payment data before updating: %j', async (overrides, status) => {
    db.payment.findFirst.mockResolvedValue({ ...payment, ...overrides })
    expect((await verifyPayment(signedRequest())).status).toBe(status)
    expectNoFulfillment()
  })

  test('checks the target owner even for a legacy payment without a userId', async () => {
    db.payment.findFirst.mockResolvedValue({ ...payment, userId: null })
    db.order.findUnique.mockResolvedValue({ userId: 'victim', totalPaise: 25000, status: 'pending_payment' })
    expect((await verifyPayment(signedRequest())).status).toBe(403)
    expectNoFulfillment()
  })

  test('verifies a correctly priced purchase and drains test side effects', async () => {
    let completeActivity!: () => void
    const activityFinished = new Promise<void>(resolve => { completeActivity = resolve })
    activity.mockReturnValue(activityFinished)
    const responsePromise = verifyPayment(signedRequest())
    await new Promise(resolve => setImmediate(resolve))
    expect(trackEvent).not.toHaveBeenCalled()
    completeActivity()
    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ verified: true, payment: { id: payment.id } })
    expect(db.payment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ statusEnum: 'SUCCESS', metadata: { orderId: 'owned-order' } }) }))
    expect(activateStore).toHaveBeenCalledWith({ orderId: payment.gatewayOrderId, paymentId: 'pay_trusted' })
    expect(trackEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'purchase' }))
  })

  test('returns success if optional analytics request context is unavailable', async () => {
    analytics.getSessionId.mockRejectedValue(new Error('cookies outside request scope'))
    expect((await verifyPayment(signedRequest())).status).toBe(200)
    expect(db.payment.update).toHaveBeenCalled()
    expect(activateStore).toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith('[payments][verify][analytics_failed]', { paymentId: payment.id })
  })

  test('a replay checks ownership without repricing a completed purchase', async () => {
    db.payment.findFirst.mockResolvedValue({ ...payment, status: 'success', statusEnum: 'SUCCESS', gatewayPaymentId: 'pay_trusted' })
    db.order.findUnique.mockResolvedValue({ userId: 'buyer', totalPaise: 30000, status: 'paid' })
    const response = await verifyPayment(signedRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ verified: true, idempotent: true })
    expectNoFulfillment()
  })

  test('rejects a replay using a different payment identifier', async () => {
    db.payment.findFirst.mockResolvedValue({ ...payment, status: 'success', statusEnum: 'SUCCESS', gatewayPaymentId: 'pay_original' })
    expect((await verifyPayment(signedRequest())).status).toBe(409)
    expectNoFulfillment()
  })
})
