import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { membershipQuoteId } from './checkout'
import type { MembershipStatus } from '@prisma/client'

const subscriptionSchema = z.object({
  id: z.string().min(1), plan_id: z.string().optional(),
  current_start: z.number().int().positive().nullable().optional(),
  current_end: z.number().int().positive().nullable().optional(),
  charge_at: z.number().int().positive().nullable().optional(),
})
const eventSchema = z.object({
  event: z.string(), created_at: z.number().int().positive(),
  payload: z.object({ subscription: z.object({ entity: subscriptionSchema }),
    payment: z.object({ entity: z.object({ id: z.string().min(1), amount: z.number().int().positive(), currency: z.string(), status: z.string() }) }).optional(),
  }),
})
const states: Record<string, MembershipStatus> = {
  'subscription.activated': 'active', 'subscription.resumed': 'active', 'subscription.charged': 'active',
  'subscription.pending': 'halted', 'subscription.halted': 'halted', 'subscription.paused': 'paused',
  'subscription.cancelled': 'cancelled', 'subscription.completed': 'cancelled',
}
const quoteSchema = z.object({
  kind: z.literal('membership'), membershipId: z.string(), subscriptionId: z.string(),
  razorpayPlanId: z.string(), credits: z.number().int().min(0).max(10000),
  lastEventAt: z.number().optional(), lastEvent: z.string().optional(),
}).passthrough()

/** Apply signed subscription events only to a server-created checkout; serialize grants per owner. */
export async function applyMembershipEvent(input: unknown): Promise<{ applied: boolean; action?: string; reason?: string; gatewayPaymentId?: string } | null> {
  const name = typeof input === 'object' && input !== null && 'event' in input ? input.event : undefined
  if (typeof name !== 'string' || !Object.hasOwn(states, name)) return null
  const event = eventSchema.parse(input)
  const subscription = event.payload.subscription.entity
  const bound = await prisma.vIPMembership.findUnique({ where: { subscriptionId: subscription.id } })
  if (!bound) return { applied: false, reason: 'membership-not-found' }
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'membership', bound.userId)
    const membership = await tx.vIPMembership.findUniqueOrThrow({ where: { id: bound.id } })
    const quote = await tx.payment.findUnique({ where: { id: membershipQuoteId(membership.id) } })
    // Legacy or manually created subscriptions require reconciliation, never guessed ownership/pricing.
    if (!quote) return { applied: false, reason: 'membership-quote-missing' }
    const metadata = quoteSchema.parse(quote.metadata)
    if (quote.userId !== membership.userId || metadata.membershipId !== membership.id || metadata.subscriptionId !== subscription.id || subscription.plan_id !== metadata.razorpayPlanId) {
      throw new Error('MEMBERSHIP_BINDING_MISMATCH')
    }
    if (name === 'subscription.charged') {
      const payment = event.payload.payment?.entity
      if (!payment || payment.status !== 'captured' || payment.amount !== quote.amountPaise || payment.currency !== quote.currency || !subscription.current_start || !subscription.current_end || subscription.current_end <= subscription.current_start) {
        throw new Error('MEMBERSHIP_CHARGE_MISMATCH')
      }
      const creditId = `membership_${createHash('sha256').update(`${subscription.id}:${payment.id}`).digest('hex')}`
      const prior = await tx.sessionCredit.findUnique({ where: { id: creditId } })
      if (!prior) {
        const paid = await tx.payment.findUnique({ where: { gatewayPaymentId: payment.id } })
        if (paid && paid.id !== quote.id) throw new Error('MEMBERSHIP_PAYMENT_ALREADY_USED')
        // Existing checkout terms remain a single billing cycle. A second payment requires reconciliation.
        if (quote.gatewayPaymentId && quote.gatewayPaymentId !== payment.id) throw new Error('MEMBERSHIP_UNEXPECTED_RENEWAL')
        if (quote.statusEnum === 'REFUNDED') throw new Error('MEMBERSHIP_PAYMENT_REFUNDED')
        await tx.payment.update({ where: { id: quote.id }, data: { status: 'success', statusEnum: 'SUCCESS', gatewayPaymentId: payment.id, paymentId: payment.id } })
        await tx.sessionCredit.create({ data: { id: creditId, userId: membership.userId, membershipId: membership.id, credits: metadata.credits, source: 'membership' } })
        await tx.user.update({ where: { id: membership.userId }, data: { freeSessionCredits: { increment: metadata.credits } } })
      }
    }
    // Signed webhooks may arrive out of order. Never let a replay resurrect a cancelled membership.
    const stale = event.created_at < (metadata.lastEventAt ?? 0)
      || (event.created_at === metadata.lastEventAt && metadata.lastEvent === 'subscription.cancelled')
      || (membership.status === 'cancelled' && states[name] === 'active')
    const isPaid = quote.statusEnum === 'SUCCESS' || name === 'subscription.charged'
    if (!stale && (states[name] !== 'active' || isPaid)) {
      await tx.vIPMembership.update({ where: { id: membership.id }, data: {
        status: states[name],
        ...(subscription.current_start ? { startDate: new Date(subscription.current_start * 1000) } : {}),
        ...(subscription.current_end ? { endDate: new Date(subscription.current_end * 1000) } : {}),
        nextBillingAt: null, // single-cycle checkout; do not imply an automatic renewal
        ...(states[name] === 'cancelled' ? { cancelledAt: new Date(event.created_at * 1000) } : {}),
      } })
      await tx.payment.update({ where: { id: quote.id }, data: { metadata: { ...metadata, lastEventAt: event.created_at, lastEvent: name } } })
    }
    const active = await tx.vIPMembership.count({ where: { userId: membership.userId, status: 'active', OR: [{ endDate: null }, { endDate: { gt: new Date() } }] } })
    await tx.user.update({ where: { id: membership.userId }, data: { vip: active > 0 } })
    return { applied: true, action: name === 'subscription.charged' ? 'subscription.charge' : 'subscription.update', gatewayPaymentId: name === 'subscription.charged' ? event.payload.payment?.entity.id : undefined }
  })
}
