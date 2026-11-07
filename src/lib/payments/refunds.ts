import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { z } from 'zod'

type RefundStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN'
type ExpectedRefund = { gatewayPaymentId: string; amountPaise: number; currency: 'INR' }

function confirmed(status: string | null) {
  return ['SUCCESS', 'PROCESSED'].includes((status ?? '').toUpperCase())
}

/** Persist gateway outcomes under one payment lock; a delayed response cannot undo confirmation. */
export async function recordRefundOutcome(
  refundId: string,
  gatewayRefundId: string | null,
  status: RefundStatus,
  expected?: ExpectedRefund,
) {
  return prisma.$transaction(async tx => {
    const initial = await tx.refund.findUniqueOrThrow({ where: { id: refundId } })
    const initialPayment = await tx.payment.findUniqueOrThrow({ where: { id: initial.paymentId } })
    // Match cancellation/finalization's healer-first order before serializing all refunds for a payment.
    if (initialPayment.bookingId) {
      const booking = await tx.booking.findUnique({ where: { id: initialPayment.bookingId }, select: { healerId: true } })
      if (booking) await lockTransaction(tx, 'healer', booking.healerId)
    }
    await lockTransaction(tx, 'payment', `refund:${initial.paymentId}`)
    const refund = await tx.refund.findUniqueOrThrow({ where: { id: refundId } })
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: refund.paymentId } })
    if (refund.paymentId !== initial.paymentId || payment.gateway.toLowerCase() !== 'razorpay'
      || payment.currency !== 'INR' || !payment.gatewayPaymentId
      || !Number.isSafeInteger(refund.amountPaise) || refund.amountPaise <= 0
      || refund.amountPaise > payment.amountPaise
      || !['SUCCESS', 'REFUNDED'].includes((payment.statusEnum ?? payment.status).toUpperCase())) {
      throw new Error('REFUND_PAYMENT_INVALID')
    }
    if ((refund.gatewayRefundId && gatewayRefundId && refund.gatewayRefundId !== gatewayRefundId)
      || (expected && (payment.gatewayPaymentId !== expected.gatewayPaymentId
        || refund.amountPaise !== expected.amountPaise || payment.currency !== expected.currency))) {
      throw new Error('REFUND_BINDING_MISMATCH')
    }
    const previous = (refund.status ?? '').toUpperCase()
    const next: RefundStatus = confirmed(previous) ? 'SUCCESS'
      : previous === 'FAILED' && ['PENDING', 'UNKNOWN'].includes(status) ? 'FAILED' : status
    const refunds = await tx.refund.findMany({ where: { paymentId: payment.id } })
    const total = refunds.reduce((sum, row) => {
      if (!(row.id === refund.id ? next === 'SUCCESS' : confirmed(row.status))) return sum
      if (!Number.isSafeInteger(row.amountPaise) || row.amountPaise <= 0) throw new Error('REFUND_AMOUNT_INVALID')
      return sum + row.amountPaise
    }, 0)
    if (!Number.isSafeInteger(total) || total > payment.amountPaise) throw new Error('REFUND_TOTAL_EXCEEDS_PAYMENT')
    const updated = await tx.refund.update({
      where: { id: refund.id },
      data: { status: next, gatewayRefundId: refund.gatewayRefundId ?? gatewayRefundId },
    })
    if (total === payment.amountPaise) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: 'refunded', statusEnum: 'REFUNDED' } })
    }
    return { ...updated, status: next }
  }, { maxWait: 10000, timeout: 10000 })
}

const refundEvent = z.object({
  event: z.enum(['refund.created', 'refund.processed', 'refund.failed']),
  payload: z.object({
    refund: z.object({ entity: z.object({
      id: z.string().min(1), payment_id: z.string().min(1), amount: z.number().int().positive(),
      currency: z.literal('INR'), status: z.enum(['pending', 'processed', 'failed']),
    }) }),
  }),
}).refine(e => e.event === 'refund.created' || e.payload.refund.entity.status === e.event.slice('refund.'.length))

/** Reconcile only an existing gateway-bound intent; never create a refund or trust customer notes. */
export async function applyRefundEvent(event: unknown) {
  const type = (event as { event?: unknown } | null)?.event
  if (!['refund.created', 'refund.processed', 'refund.failed'].includes(String(type))) return null
  const parsed = refundEvent.parse(event)
  const entity = parsed.payload.refund.entity
  const refund = await prisma.refund.findUnique({ where: { gatewayRefundId: entity.id } })
  if (!refund) {
    const payment = await prisma.payment.findUnique({ where: { gatewayPaymentId: entity.payment_id }, select: { id: true } })
    // Delivery can beat the API response that saves the refund ID. Ask for a retry, not a guessed binding.
    if (payment) throw new Error('REFUND_BINDING_NOT_READY')
    return { applied: false, reason: 'refund-not-found' }
  }
  await recordRefundOutcome(refund.id, entity.id,
    entity.status === 'processed' ? 'SUCCESS' : entity.status === 'failed' ? 'FAILED' : 'PENDING',
    { gatewayPaymentId: entity.payment_id, amountPaise: entity.amount, currency: entity.currency })
  return { applied: true, action: 'refund.reconcile' }
}
