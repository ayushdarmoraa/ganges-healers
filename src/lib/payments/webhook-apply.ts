// src/lib/payments/webhook-apply.ts
import { applyMembershipEvent } from '@/lib/memberships/webhook'
import { prisma } from '@/lib/prisma'
import { finalizePayment } from '@/lib/payments/finalize'
import { z } from 'zod'
import { createAndStoreInvoicePdf } from '@/lib/invoices'
import { applyRefundEvent } from '@/lib/payments/refunds'

type RazorpayEvent = {
  event?: string
  payload?: {
    subscription?: { entity?: { id?: string | null } | null; id?: string | null } | null
    payment?: { entity?: { id?: string | null; order_id?: string | null } | null; id?: string | null } | null
  } | null
  subscription_id?: string | null
  payment_id?: string | null
}

type ApplyResult = { applied: boolean; action?: string; reason?: string }

/**
 * Minimal, idempotent side-effects for Razorpay webhooks.
 * - Bound subscription events: transactional ownership, captured payment, and credit fulfillment.
 * - payment.captured: finish the server-owned purchase and invoice it, even if the browser closed.
 * - Refund lifecycle: reconcile a saved refund intent without submitting money again.
 *
 * Never throws; returns { applied, action?, reason? }.
 */
export async function applyWebhookSideEffects(evt: unknown): Promise<ApplyResult> {
  try {
    const e = evt as RazorpayEvent
    const type = e?.event
    if (!type) return { applied: false, reason: 'no-event-type' }

    const membershipResult = await applyMembershipEvent(evt)
    if (membershipResult) {
      if (membershipResult.applied && 'gatewayPaymentId' in membershipResult && membershipResult.gatewayPaymentId) {
        await createAndStoreInvoicePdf(membershipResult.gatewayPaymentId, { force: false })
      }
      return membershipResult
    }

    const refundResult = await applyRefundEvent(evt)
    if (refundResult) return refundResult

    if (type === 'payment.captured') {
      const gatewayPaymentId =
        e?.payload?.payment?.entity?.id ??
        e?.payload?.payment?.id ??
        e?.payment_id ?? undefined

      if (!gatewayPaymentId) return { applied: false, action: 'payment.invoice', reason: 'no-gateway-payment-id' }

      const entity = e?.payload?.payment?.entity
      if (entity?.order_id) {
        const captured = z.object({ id: z.string().min(1), order_id: z.string().min(1), amount: z.number().int().positive(), currency: z.literal('INR'), status: z.literal('captured') }).parse(entity)
        const payment = await prisma.payment.findUnique({ where: { gatewayOrderId: captured.order_id }, include: { booking: { select: { userId: true } } } })
        if (!payment) return { applied: false, reason: 'payment-not-found' }
        if (payment.type === 'MEMBERSHIP') return { applied: false, reason: 'membership-charge-handled-separately' }
        const userId = payment.userId ?? payment.booking?.userId
        if (!userId) throw new Error('PAYMENT_OWNER_MISSING')
        await finalizePayment({ orderId: captured.order_id, paymentId: captured.id, userId, captured: { amountPaise: captured.amount, currency: captured.currency } })
        await createAndStoreInvoicePdf(captured.id, { force: false })
        return { applied: true, action: 'payment.fulfill' }
      }
      // Legacy identifier-only invoice events retain their existing contract; they cannot fulfill a purchase.
      // Idempotent: generator skips if invoice exists or legacy url present.
      await createAndStoreInvoicePdf(gatewayPaymentId, { force: false })
      return { applied: true, action: 'payment.invoice' }
    }

    return { applied: false, reason: 'event-unhandled' }
  } catch {
    return { applied: false, reason: 'apply-error' }
  }
}
