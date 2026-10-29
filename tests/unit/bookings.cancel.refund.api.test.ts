// The Prisma store and Razorpay gateway are mocked; this suite uses no real data or credentials.
import { NextRequest } from 'next/server'

type TestBooking = {
  id: string
  userId: string
  healerId: string
  scheduledAt: Date
  updatedAt: Date
  status: string
  pricePaise: number
}

type TestPayment = {
  id: string
  bookingId: string
  gateway: string
  status: string
  statusEnum: string | null
  amountPaise: number
  gatewayPaymentId: string | null
}

type TestRefund = {
  id: string
  paymentId: string
  amountPaise: number
  reason: string | null
  status: string | null
  gatewayRefundId: string | null
  createdAt: Date
}

type MockGatewayResult = {
  gatewayRefundId: string
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  raw: unknown
}

type MockPrisma = {
  $transaction: <T>(work: (tx: MockPrisma) => Promise<T>) => Promise<T>
  $executeRaw: (...args: unknown[]) => Promise<number>
  booking: {
    findFirst: (args: {
      where: { id: string; userId: string }
      include?: { payment?: unknown }
    }) => Promise<TestBooking | (TestBooking & { payment: TestPayment | null }) | null>
    updateMany: (args: {
      where: { id: string; userId: string; status: string }
      data: Partial<TestBooking>
    }) => Promise<{ count: number }>
  }
  refund: {
    findMany: (args: { where: { paymentId: string } }) => Promise<TestRefund[]>
    create: (args: { data: Omit<TestRefund, 'id' | 'createdAt' | 'gatewayRefundId'> }) => Promise<TestRefund>
    update: (args: { where: { id: string }; data: Partial<TestRefund> }) => Promise<TestRefund>
  }
}

const mockDb: { bookings: TestBooking[]; payments: TestPayment[]; refunds: TestRefund[] } = {
  bookings: [],
  payments: [],
  refunds: [],
}
let mockUserId: string | undefined
let mockTransactionTail = Promise.resolve()

const mockHasRazorpayRefundCredentials = jest.fn(() => true)
const mockRefundPayment = jest.fn<Promise<MockGatewayResult>, [args: Parameters<typeof import('@/lib/payments/razorpay-refunds').refundPayment>[0]]>(async () => ({
  gatewayRefundId: 'rfnd_test',
  status: 'SUCCESS',
  raw: {},
}))
const mockFetchRefundStatus = jest.fn<Promise<MockGatewayResult>, [refundId: string, paymentId: string]>(async () => ({
  gatewayRefundId: 'rfnd_test',
  status: 'SUCCESS',
  raw: {},
}))

const mockPrisma: MockPrisma = {
  $transaction: async <T>(work: (tx: typeof mockPrisma) => Promise<T>) => {
    const previous = mockTransactionTail
    let release!: () => void
    mockTransactionTail = new Promise<void>(resolve => { release = resolve })
    await previous
    try {
      return await work(mockPrisma)
    } finally {
      release()
    }
  },
  $executeRaw: async () => 1,
  booking: {
    findFirst: async ({ where, include }: Parameters<MockPrisma['booking']['findFirst']>[0]) => {
      const booking = mockDb.bookings.find(row => row.id === where.id && row.userId === where.userId)
      if (!booking) return null
      const payment = mockDb.payments.find(row => row.bookingId === booking.id) ?? null
      return include?.payment ? { ...booking, payment } : booking
    },
    updateMany: async ({ where, data }: Parameters<MockPrisma['booking']['updateMany']>[0]) => {
      const booking = mockDb.bookings.find(row =>
        row.id === where.id && row.userId === where.userId && row.status === where.status
      )
      if (!booking) return { count: 0 }
      Object.assign(booking, data)
      return { count: 1 }
    },
  },
  refund: {
    findMany: async ({ where }: Parameters<MockPrisma['refund']['findMany']>[0]) =>
      mockDb.refunds.filter(row => row.paymentId === where.paymentId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    create: async ({ data }: Parameters<MockPrisma['refund']['create']>[0]) => {
      const refund: TestRefund = {
        id: `refund_${mockDb.refunds.length + 1}`,
        gatewayRefundId: null,
        createdAt: new Date(),
        ...data,
      }
      mockDb.refunds.push(refund)
      return refund
    },
    update: async ({ where, data }: Parameters<MockPrisma['refund']['update']>[0]) => {
      const refund = mockDb.refunds.find(row => row.id === where.id)
      if (!refund) throw new Error('Refund not found')
      Object.assign(refund, data)
      return refund
    },
  },
}

jest.mock('@/lib/prisma', () => ({ prisma: mockPrisma }))
jest.mock('@/lib/auth', () => ({
  auth: async () => mockUserId ? { user: { id: mockUserId, role: 'USER' } } : null,
}))
jest.mock('@/lib/payments/razorpay-refunds', () => ({
  hasRazorpayRefundCredentials: () => mockHasRazorpayRefundCredentials(),
  refundPayment: (...args: Parameters<typeof mockRefundPayment>) => mockRefundPayment(...args),
  fetchRefundStatus: (...args: Parameters<typeof mockFetchRefundStatus>) => mockFetchRefundStatus(...args),
}))

let Bookings: typeof import('@/app/api/bookings/[id]/route')

function seedBooking(options: {
  hoursUntil?: number
  status?: string
  payment?: Partial<TestPayment> | null
  pricePaise?: number
} = {}) {
  const booking: TestBooking = {
    id: `booking_${mockDb.bookings.length + 1}`,
    userId: 'buyer',
    healerId: 'healer',
    scheduledAt: new Date(Date.now() + (options.hoursUntil ?? 49) * 60 * 60 * 1000),
    updatedAt: new Date(),
    status: options.status ?? 'CONFIRMED',
    pricePaise: options.pricePaise ?? 15000,
  }
  mockDb.bookings.push(booking)
  if (options.payment !== null) {
    mockDb.payments.push({
      id: `payment_${mockDb.payments.length + 1}`,
      bookingId: booking.id,
      gateway: 'razorpay',
      status: 'success',
      statusEnum: 'SUCCESS',
      amountPaise: booking.pricePaise,
      gatewayPaymentId: `pay_${booking.id}`,
      ...options.payment,
    })
  }
  return booking
}

function deleteRequest(id: string) {
  return new NextRequest(new Request(`http://localhost/api/bookings/${id}`, { method: 'DELETE' }))
}

function patchRequest(id: string) {
  return new NextRequest(new Request(`http://localhost/api/bookings/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'cancel' }),
  }))
}

async function cancel(method: 'DELETE' | 'PATCH', id: string) {
  const request = method === 'DELETE' ? deleteRequest(id) : patchRequest(id)
  const handler = method === 'DELETE' ? Bookings.DELETE : Bookings.PATCH
  return handler(request, { params: Promise.resolve({ id }) })
}

beforeAll(async () => {
  Bookings = await import('@/app/api/bookings/[id]/route')
})

beforeEach(() => {
  mockDb.bookings.length = 0
  mockDb.payments.length = 0
  mockDb.refunds.length = 0
  mockUserId = 'buyer'
  mockTransactionTail = Promise.resolve()
  mockHasRazorpayRefundCredentials.mockReset().mockReturnValue(true)
  mockRefundPayment.mockReset().mockResolvedValue({
    gatewayRefundId: 'rfnd_test',
    status: 'SUCCESS',
    raw: {},
  })
  mockFetchRefundStatus.mockReset().mockResolvedValue({
    gatewayRefundId: 'rfnd_test',
    status: 'SUCCESS',
    raw: {},
  })
})

describe('booking cancellation and Razorpay refunds', () => {
  test('DELETE calculates the full refund from stored booking/payment data and confirms it', async () => {
    const booking = seedBooking()

    const response = await cancel('DELETE', booking.id)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.refund).toMatchObject({ band: 'FULL', refundPaise: 15000, status: 'SUCCESS' })
    expect(body.data.status).toBe('CANCELLED')
    expect(mockRefundPayment).toHaveBeenCalledWith(expect.objectContaining({
      paymentId: `pay_${booking.id}`,
      amountPaise: 15000,
      receipt: `cancel_${booking.id}`,
    }))
    expect(mockDb.refunds).toHaveLength(1)
    expect(mockDb.refunds[0]).toMatchObject({ amountPaise: 15000, status: 'SUCCESS', gatewayRefundId: 'rfnd_test' })
  })

  test('PATCH uses the same server-side half-refund policy', async () => {
    const booking = seedBooking({ hoursUntil: 36 })

    const response = await cancel('PATCH', booking.id)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.refund).toMatchObject({ band: 'HALF', refundPaise: 7500, status: 'SUCCESS' })
    expect(mockRefundPayment).toHaveBeenCalledWith(expect.objectContaining({ amountPaise: 7500 }))
  })

  test.each([
    ['unpaid', { payment: null }],
    ['credit', { payment: { gateway: 'vip_credit', amountPaise: 0, gatewayPaymentId: null } }],
  ])('%s bookings cancel without a cash refund', async (_label, options) => {
    const booking = seedBooking(options)

    const response = await cancel('DELETE', booking.id)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.refund).toMatchObject({ refundPaise: 0, status: 'NOT_REQUIRED' })
    expect(mockRefundPayment).not.toHaveBeenCalled()
    expect(mockDb.refunds).toHaveLength(0)
  })

  test('both cancellation methods reject bookings inside the 24-hour limit', async () => {
    for (const method of ['DELETE', 'PATCH'] as const) {
      const booking = seedBooking({ hoursUntil: 23 })
      const response = await cancel(method, booking.id)
      expect(response.status).toBe(403)
      expect(mockDb.bookings.find(row => row.id === booking.id)?.status).toBe('CONFIRMED')
    }
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  test('completed bookings cannot be cancelled or refunded', async () => {
    const booking = seedBooking({ status: 'COMPLETED' })

    const response = await cancel('DELETE', booking.id)

    expect(response.status).toBe(400)
    expect(mockDb.bookings[0].status).toBe('COMPLETED')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  test('retries through either method reuse the confirmed refund', async () => {
    const booking = seedBooking()

    const first = await cancel('DELETE', booking.id)
    const second = await cancel('PATCH', booking.id)

    expect((await first.json()).refund.status).toBe('SUCCESS')
    expect((await second.json()).refund.status).toBe('SUCCESS')
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    expect(mockDb.refunds).toHaveLength(1)
  })

  test('concurrent DELETE and PATCH requests issue only one gateway refund', async () => {
    const booking = seedBooking()
    let completeRefund!: (result: MockGatewayResult) => void
    mockRefundPayment.mockReturnValueOnce(new Promise(resolve => { completeRefund = resolve }))

    const firstRequest = cancel('DELETE', booking.id)
    await new Promise(resolve => setTimeout(resolve, 0))
    const secondRequest = cancel('PATCH', booking.id)
    const secondResponse = await secondRequest
    completeRefund({ gatewayRefundId: 'rfnd_concurrent', status: 'SUCCESS', raw: {} })
    const firstResponse = await firstRequest

    expect((await firstResponse.json()).refund.status).toBe('SUCCESS')
    expect((await secondResponse.json()).refund.status).toBe('UNKNOWN')
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    expect(mockDb.refunds).toHaveLength(1)
  })

  test('gateway-reported failure is surfaced and not automatically resubmitted', async () => {
    const booking = seedBooking()
    mockRefundPayment.mockResolvedValueOnce({
      gatewayRefundId: 'rfnd_failed',
      status: 'FAILED',
      raw: {},
    })

    const first = await cancel('DELETE', booking.id)
    const retry = await cancel('DELETE', booking.id)

    expect((await first.json()).refund.status).toBe('FAILED')
    expect((await retry.json()).refund.status).toBe('FAILED')
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
  })

  test('an uncertain gateway failure is not reported as complete or resubmitted', async () => {
    const booking = seedBooking()
    mockRefundPayment.mockRejectedValueOnce(new Error('request timeout'))

    const first = await cancel('DELETE', booking.id)
    const retry = await cancel('PATCH', booking.id)

    expect((await first.json()).refund.status).toBe('UNKNOWN')
    expect((await retry.json()).refund.status).toBe('UNKNOWN')
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    expect(mockDb.refunds[0].status).toBe('UNKNOWN')
  })

  test('a known pending refund is fetched on retry instead of being created again', async () => {
    const booking = seedBooking({ status: 'CANCELLED' })
    mockDb.refunds.push({
      id: 'existing_refund',
      paymentId: mockDb.payments[0].id,
      amountPaise: 15000,
      reason: 'booking-cancellation',
      status: 'PENDING',
      gatewayRefundId: 'rfnd_pending',
      createdAt: new Date(),
    })

    const response = await cancel('DELETE', booking.id)
    const body = await response.json()

    expect(body.refund.status).toBe('SUCCESS')
    expect(mockFetchRefundStatus).toHaveBeenCalledWith('rfnd_pending', `pay_${booking.id}`)
    expect(mockRefundPayment).not.toHaveBeenCalled()
    expect(mockDb.refunds[0].status).toBe('SUCCESS')
  })

  test('the legacy simulated refund is retried as a real refund, never treated as complete', async () => {
    const booking = seedBooking({ status: 'CANCELLED' })
    mockDb.refunds.push({
      id: 'simulated_refund',
      paymentId: mockDb.payments[0].id,
      amountPaise: 15000,
      reason: null,
      status: 'SIMULATED',
      gatewayRefundId: null,
      createdAt: new Date(),
    })

    const response = await cancel('PATCH', booking.id)

    expect((await response.json()).refund.status).toBe('SUCCESS')
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    expect(mockDb.refunds).toHaveLength(1)
  })

  test('a missing gateway configuration is truthful and does not create a simulated refund', async () => {
    const booking = seedBooking()
    mockHasRazorpayRefundCredentials.mockReturnValue(false)

    const response = await cancel('DELETE', booking.id)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.refund.status).toBe('UNAVAILABLE')
    expect(body.refund.message).toMatch(/contact support/i)
    expect(mockRefundPayment).not.toHaveBeenCalled()
    expect(mockDb.refunds).toHaveLength(1)
    expect(mockDb.refunds[0]).toMatchObject({ status: 'UNAVAILABLE', reason: 'gateway-not-configured' })
  })

  test('a cancellation deferred for missing credentials can safely retry once credentials are available', async () => {
    const booking = seedBooking()
    mockHasRazorpayRefundCredentials.mockReturnValue(false)

    const first = await cancel('DELETE', booking.id)
    expect((await first.json()).refund.status).toBe('UNAVAILABLE')

    mockHasRazorpayRefundCredentials.mockReturnValue(true)
    const retry = await cancel('PATCH', booking.id)

    expect((await retry.json()).refund.status).toBe('SUCCESS')
    expect(mockRefundPayment).toHaveBeenCalledTimes(1)
    expect(mockDb.refunds).toHaveLength(1)
  })

  test('a payment amount mismatch is not submitted for refund', async () => {
    const booking = seedBooking({ payment: { amountPaise: 14000 } })

    const response = await cancel('DELETE', booking.id)
    const body = await response.json()

    expect(body.refund.status).toBe('UNAVAILABLE')
    expect(mockRefundPayment).not.toHaveBeenCalled()
    expect(mockDb.refunds).toHaveLength(0)
  })

  test('a payment already marked refunded requires review unless a confirmed refund is stored', async () => {
    const booking = seedBooking({ payment: { status: 'refunded', statusEnum: 'REFUNDED' } })

    const response = await cancel('DELETE', booking.id)

    expect((await response.json()).refund.status).toBe('UNAVAILABLE')
    expect(mockRefundPayment).not.toHaveBeenCalled()
    expect(mockDb.refunds).toHaveLength(0)
  })

  test('a fully refunded payment with a matching confirmed refund is not refunded again', async () => {
    const booking = seedBooking({ payment: { status: 'refunded', statusEnum: 'REFUNDED' } })
    mockDb.refunds.push({
      id: 'confirmed_refund',
      paymentId: mockDb.payments[0].id,
      amountPaise: 15000,
      reason: null,
      status: 'processed',
      gatewayRefundId: 'rfnd_already_processed',
      createdAt: new Date(),
    })

    const response = await cancel('DELETE', booking.id)

    expect((await response.json()).refund.status).toBe('SUCCESS')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  test('a legacy cancelled booking without a refund record requires review rather than a blind retry', async () => {
    const booking = seedBooking({ status: 'CANCELLED' })
    booking.updatedAt = new Date(Date.now() - 60 * 1000)

    const response = await cancel('DELETE', booking.id)

    expect((await response.json()).refund.status).toBe('UNAVAILABLE')
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })

  test('another user cannot cancel or refund the booking', async () => {
    const booking = seedBooking()
    mockUserId = 'someone-else'

    const response = await cancel('DELETE', booking.id)

    expect(response.status).toBe(404)
    expect(mockRefundPayment).not.toHaveBeenCalled()
  })
})
