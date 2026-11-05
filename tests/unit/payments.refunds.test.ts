import type { Payment, Refund } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { applyRefundEvent, recordRefundOutcome } from '@/lib/payments/refunds'
import { applyWebhookSideEffects } from '@/lib/payments/webhook-apply'
import { POST } from '@/app/api/payments/webhook/route'
import { createHmac } from 'node:crypto'

jest.mock('@/lib/memberships/webhook', () => ({ applyMembershipEvent: jest.fn(async () => null) }))
jest.mock('@/lib/invoices', () => ({ createAndStoreInvoicePdf: jest.fn() }))
jest.mock('@/lib/prisma', () => {
  const tx = {
    $executeRaw: jest.fn(async () => 1),
    booking: { findUnique: jest.fn() },
    payment: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
    refund: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  }
  return { prisma: { ...tx, $transaction: jest.fn(async work => work(tx)) } }
})

// These fakes return ordinary promises; Prisma's relation-chaining client is not needed here.
type PromiseMocks<T> = { [K in keyof T]: T[K] extends (...args: infer A) => infer R
  ? jest.Mock<Promise<Awaited<R>>, A> : PromiseMocks<T[K]> }
const db = prisma as unknown as PromiseMocks<Pick<typeof prisma, 'payment' | 'refund' | 'booking' | '$transaction'>>
let payment: Pick<Payment, 'id' | 'bookingId' | 'gateway' | 'currency' | 'gatewayPaymentId' | 'status' | 'statusEnum' | 'amountPaise'>
let refunds: Refund[]
const previousSecret = process.env.RAZORPAY_WEBHOOK_SECRET
const previousEvents = process.env.PAYMENT_EVENTS_ENABLED
const webhookSecret = 'refund-unit-webhook-secret'
afterAll(() => {
  if (previousSecret === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET
  else process.env.RAZORPAY_WEBHOOK_SECRET = previousSecret
  if (previousEvents === undefined) delete process.env.PAYMENT_EVENTS_ENABLED
  else process.env.PAYMENT_EVENTS_ENABLED = previousEvents
})
function send(payload: unknown, validSignature = true) {
  const body = JSON.stringify(payload)
  return POST(new Request('http://localhost/api/payments/webhook', {
    method: 'POST', body, headers: { 'x-razorpay-signature': validSignature
      ? createHmac('sha256', webhookSecret).update(body).digest('hex') : '0'.repeat(64) },
  }))
}
function event(status: 'pending' | 'processed' | 'failed' = 'processed', type = `refund.${status === 'pending' ? 'created' : status}`) {
  return { event: type, payload: { refund: { entity: { id: 'rfnd_owned', payment_id: 'pay_owned', amount: 1000, currency: 'INR', status, notes: { userId: 'another-owner' } } } } }
}
beforeEach(() => {
  jest.clearAllMocks()
  process.env.RAZORPAY_WEBHOOK_SECRET = webhookSecret
  process.env.PAYMENT_EVENTS_ENABLED = 'true'
  payment = { id: 'payment', bookingId: 'booking', gateway: 'razorpay', currency: 'INR', gatewayPaymentId: 'pay_owned', status: 'success', statusEnum: 'SUCCESS', amountPaise: 1000 }
  refunds = [{ id: 'refund', paymentId: 'payment', gatewayRefundId: 'rfnd_owned', amountPaise: 1000, status: 'PENDING', reason: 'booking-cancellation', createdAt: new Date('2026-11-05T00:00:00Z') }]
  db.payment.findUniqueOrThrow.mockImplementation(async () => ({ ...payment }) as Payment)
  db.payment.findUnique.mockResolvedValue(null)
  db.booking.findUnique.mockResolvedValue({ healerId: 'healer' } as never)
  db.refund.findUnique.mockImplementation(async ({ where }) => refunds.find(row => row.gatewayRefundId === where.gatewayRefundId) ?? null)
  db.refund.findUniqueOrThrow.mockImplementation(async ({ where }) => {
    const row = refunds.find(row => row.id === where.id)
    if (!row) throw new Error('not found')
    return { ...row }
  })
  db.refund.findMany.mockImplementation(async () => refunds.map(row => ({ ...row })))
  db.refund.update.mockImplementation(async ({ where, data }) => {
    const row = refunds.find(row => row.id === where.id)!
    Object.assign(row, data)
    return { ...row }
  })
  db.payment.update.mockImplementation(async ({ data }) => Object.assign(payment, data) as Payment)
})

test('a processed webhook confirms the existing intent and marks a full payment refunded', async () => {
  await expect(applyWebhookSideEffects(event())).resolves.toEqual({ applied: true, action: 'refund.reconcile' })
  expect(refunds[0].status).toBe('SUCCESS')
  expect(payment.statusEnum).toBe('REFUNDED')
  const locks = jest.mocked(prisma.$executeRaw).mock.calls
  expect(locks.map(call => call.slice(1))).toEqual([[72102, 'healer'], [72101, 'refund:payment']])
})

test('processed duplicate, delayed pending/failed events and late API responses cannot undo confirmation', async () => {
  await applyRefundEvent(event())
  await applyRefundEvent(event())
  await applyRefundEvent(event('pending'))
  await applyRefundEvent(event('failed'))
  await recordRefundOutcome('refund', null, 'UNKNOWN')
  expect(refunds[0]).toMatchObject({ status: 'SUCCESS', gatewayRefundId: 'rfnd_owned' })
  expect(payment.statusEnum).toBe('REFUNDED')
  expect(refunds).toHaveLength(1)
})

test('a created event may already contain the documented processed status', async () => {
  await applyRefundEvent(event('processed', 'refund.created'))
  expect(refunds[0].status).toBe('SUCCESS')
})

test('failed refunds stay failed across delayed pending or unknown updates, but can reconcile as processed', async () => {
  await applyRefundEvent(event('failed'))
  await applyRefundEvent(event('pending'))
  await recordRefundOutcome('refund', null, 'UNKNOWN')
  expect(refunds[0].status).toBe('FAILED')
  expect(payment.statusEnum).toBe('SUCCESS')
  await applyRefundEvent(event())
  expect(refunds[0].status).toBe('SUCCESS')
})

test('partial refunds do not mark the payment refunded until all confirmed parts cover its total', async () => {
  payment.amountPaise = 2000
  refunds.push({ ...refunds[0], id: 'second', gatewayRefundId: 'rfnd_second' })
  await applyRefundEvent(event())
  expect(payment.statusEnum).toBe('SUCCESS')
  await recordRefundOutcome('second', 'rfnd_second', 'SUCCESS')
  expect(payment.statusEnum).toBe('REFUNDED')
})

test.each(['amount', 'currency', 'payment_id', 'status'] as const)('mismatched webhook %s cannot update a stored intent', async key => {
  const payload = event()
  if (key === 'amount') payload.payload.refund.entity.amount = 1
  else if (key === 'status') payload.payload.refund.entity.status = 'pending'
  else payload.payload.refund.entity[key] = 'not-a-match'
  await expect(applyWebhookSideEffects(payload)).resolves.toEqual({ applied: false, reason: 'apply-error' })
  expect(db.refund.update).not.toHaveBeenCalled()
  expect(db.payment.update).not.toHaveBeenCalled()
})

test('refund identifiers cannot be rebound by a delayed API response', async () => {
  await expect(recordRefundOutcome('refund', 'rfnd_other', 'SUCCESS')).rejects.toThrow('REFUND_BINDING_MISMATCH')
  expect(db.refund.update).not.toHaveBeenCalled()
})

test('over-refunding is rejected before either record is updated', async () => {
  refunds.push({ ...refunds[0], id: 'previous', gatewayRefundId: 'rfnd_previous', status: 'PROCESSED', amountPaise: 1 })
  await expect(applyWebhookSideEffects(event())).resolves.toEqual({ applied: false, reason: 'apply-error' })
  expect(db.refund.update).not.toHaveBeenCalled()
  expect(db.payment.update).not.toHaveBeenCalled()
})

test.each(['PENDING', 'FAILED'] as const)('an uncaptured %s payment cannot be reconciled as a cash refund', async status => {
  payment.statusEnum = status
  await expect(applyWebhookSideEffects(event())).resolves.toEqual({ applied: false, reason: 'apply-error' })
  expect(db.refund.update).not.toHaveBeenCalled()
})

test('unrelated refunds are acknowledged without guessing an owner or creating an intent', async () => {
  refunds.length = 0
  await expect(applyRefundEvent(event())).resolves.toEqual({ applied: false, reason: 'refund-not-found' })
  expect(db.$transaction).not.toHaveBeenCalled()
})

test('delivery before the gateway ID is saved requests a retry and can reconcile once bound', async () => {
  refunds[0].gatewayRefundId = null
  db.payment.findUnique.mockResolvedValue(payment as Payment)
  await expect(applyWebhookSideEffects(event())).resolves.toEqual({ applied: false, reason: 'apply-error' })
  expect(db.refund.update).not.toHaveBeenCalled()
  refunds[0].gatewayRefundId = 'rfnd_owned'
  await expect(applyWebhookSideEffects(event())).resolves.toEqual({ applied: true, action: 'refund.reconcile' })
})

test('other webhook types and incomplete refund payloads preserve skip/retry behavior', async () => {
  await expect(applyRefundEvent({ event: 'refund.speed_changed' })).resolves.toBeNull()
  await expect(applyWebhookSideEffects({ event: 'refund.processed' })).resolves.toEqual({ applied: false, reason: 'apply-error' })
  expect(db.$transaction).not.toHaveBeenCalled()
})

test('an invalid signature cannot reach refund reconciliation', async () => {
  const response = await send(event(), false)
  expect(response.status).toBe(401)
  expect(await response.json()).toEqual({ ok: false, error: 'signature-mismatch' })
  expect(db.$transaction).not.toHaveBeenCalled()
  expect(db.refund.findUnique).not.toHaveBeenCalled()
})

test('disabled side effects acknowledge a valid signature without touching refunds', async () => {
  process.env.PAYMENT_EVENTS_ENABLED = 'false'
  const response = await send(event())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
  expect(db.$transaction).not.toHaveBeenCalled()
  expect(db.refund.findUnique).not.toHaveBeenCalled()
})

test('a signed valid event retains the endpoint success response after reconciliation', async () => {
  const response = await send(event())
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ ok: true })
  expect(refunds[0].status).toBe('SUCCESS')
})

test('a signed binding mismatch retains the endpoint retry response without saving the event', async () => {
  const payload = event()
  payload.payload.refund.entity.payment_id = 'pay_wrong'
  const response = await send(payload)
  expect(response.status).toBe(500)
  expect(await response.json()).toEqual({ ok: false, error: 'apply-error' })
  expect(db.refund.update).not.toHaveBeenCalled()
})
