// src/lib/payments/webhook-apply.ts
import { applyMembershipEvent } from '@/lib/memberships/webhook'
import { createAndStoreInvoicePdf } from '@/lib/invoices'

type RazorpayEvent = {
  event?: string
  payload?: {
    subscription?: { entity?: { id?: string | null } | null; id?: string | null } | null
    payment?: { entity?: { id?: string | null } | null; id?: string | null } | null
  } | null
  subscription_id?: string | null
  payment_id?: string | null
}

type ApplyResult = { applied: boolean; action?: string; reason?: string }

/**
 * Minimal, idempotent side-effects for Razorpay webhooks.
 * - Bound subscription events: transactional ownership, captured payment, and credit fulfillment.
 * - payment.captured: trigger invoice generation via resilient generator (idempotent)
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

    if (type === 'payment.captured') {
      const gatewayPaymentId =
        e?.payload?.payment?.entity?.id ??
        e?.payload?.payment?.id ??
        e?.payment_id ?? undefined

      if (!gatewayPaymentId) return { applied: false, action: 'payment.invoice', reason: 'no-gateway-payment-id' }

      // Idempotent: generator skips if invoice exists or legacy url present.
      await createAndStoreInvoicePdf(gatewayPaymentId, { force: false })
      return { applied: true, action: 'payment.invoice' }
    }

    return { applied: false, reason: 'event-unhandled' }
  } catch {
    return { applied: false, reason: 'apply-error' }
  }
}
