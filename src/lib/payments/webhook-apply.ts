// src/lib/payments/webhook-apply.ts
import * as PrismaNS from '@/lib/prisma'
import type { PrismaClient, MembershipStatus } from '@prisma/client'
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
 * - subscription.activated: try to mark existing VIPMembership ACTIVE by subscriptionId (no create if missing)
 * - payment.captured: trigger invoice generation via resilient generator (idempotent)
 *
 * Never throws; returns { applied, action?, reason? }.
 */
export async function applyWebhookSideEffects(evt: unknown): Promise<ApplyResult> {
  try {
    // Support tests mocking default export; prefer named prisma when present
    const prisma: PrismaClient = (PrismaNS as { prisma?: PrismaClient; default?: PrismaClient }).prisma
      ?? (PrismaNS as { prisma?: PrismaClient; default?: PrismaClient }).default!
    const e = evt as RazorpayEvent
    const type = e?.event
    if (!type) return { applied: false, reason: 'no-event-type' }

    if (type === 'subscription.activated') {
      const subId =
        e?.payload?.subscription?.entity?.id ??
        e?.payload?.subscription?.id ??
        e?.subscription_id ?? undefined

      if (!subId) return { applied: false, action: 'subscription.activate', reason: 'no-subscription-id' }

      // Idempotent: only update if membership exists. Do not create rows here.
      try {
        const ACTIVE_STATUS: MembershipStatus = 'active'
        await prisma.vIPMembership.update({
          where: { subscriptionId: subId },
          data: { status: ACTIVE_STATUS },
        })
        return { applied: true, action: 'subscription.activate' }
      } catch {
        // Not found -> skip silently (legacy / out-of-band creation)
        return { applied: false, action: 'subscription.activate', reason: 'membership-not-found' }
      }
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
