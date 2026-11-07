import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import type { MembershipPlan, Prisma } from '@prisma/client'

export class MembershipCheckoutError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

/** Normalize existing object and legacy string-array benefits into a bounded credit grant. */
export function membershipCredits(benefits: Prisma.JsonValue): number {
  const raw = Array.isArray(benefits)
    ? Number(String(benefits[0]).match(/\d+/)?.[0] ?? 0)
    : benefits && typeof benefits === 'object' ? Number(benefits.freeSessions ?? 0) : 0
  if (!Number.isSafeInteger(raw) || raw < 0 || raw > 10000) throw new MembershipCheckoutError('Invalid plan benefits', 400)
  return raw
}

export const membershipQuoteId = (membershipId: string) => `membership_quote_${membershipId}`

interface GatewaySubscription { id: string; short_url?: string; shortUrl?: string }
type CreateSubscription = (input: { plan_id: string; total_count: number; customer_notify: number; notes: { userId: string; planId: string } }) => Promise<GatewaySubscription>

async function existingCheckout(tx: Prisma.TransactionClient, userId: string, planId: string) {
  const existing = await tx.vIPMembership.findFirst({
    where: { userId, OR: [{ status: { in: ['pending', 'paused', 'halted'] } }, { status: 'active', OR: [{ endDate: null }, { endDate: { gt: new Date() } }] }] }, orderBy: { createdAt: 'desc' },
  })
  if (!existing) return null
  if (existing.status !== 'pending' || existing.planId !== planId) throw new MembershipCheckoutError('A membership already exists. Manage it before choosing another plan.', 409)
  const quote = await tx.payment.findUnique({ where: { id: membershipQuoteId(existing.id) } })
  const metadata = quote?.metadata
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) || typeof metadata.shortUrl !== 'string') {
    throw new MembershipCheckoutError('Your membership is awaiting confirmation. Please contact support.', 409)
  }
  return { id: existing.subscriptionId, shortUrl: metadata.shortUrl }
}

/** Bind a hosted checkout to its authenticated owner and freeze its price/benefits before returning it. */
export async function createMembershipCheckout(userId: string, plan: MembershipPlan, create: CreateSubscription) {
  if (!plan.isActive || !Number.isSafeInteger(plan.pricePaise) || plan.pricePaise <= 0) throw new MembershipCheckoutError('Invalid membership plan', 400)
  const credits = membershipCredits(plan.benefits)
  const existing = await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'membership', userId)
    return existingCheckout(tx, userId, plan.id)
  })
  if (existing) return existing
  // Gateway I/O is outside the database transaction. Concurrent requests return the one bound winner.
  const sub = await create({ plan_id: plan.razorpayPlanId.trim(), total_count: 1, customer_notify: 1, notes: { userId, planId: plan.id } })
  const shortUrl = sub.short_url ?? sub.shortUrl
  if (!sub.id || !shortUrl || new URL(shortUrl).protocol !== 'https:' || !/^(rzp\.io|([a-z0-9-]+\.)*razorpay\.com)$/i.test(new URL(shortUrl).hostname)) throw new Error('Invalid gateway checkout response')
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'membership', userId)
    const winner = await existingCheckout(tx, userId, plan.id)
    if (winner) return winner
    const current = await tx.membershipPlan.findUnique({ where: { id: plan.id } })
    if (!current?.isActive || current.razorpayPlanId !== plan.razorpayPlanId || current.pricePaise !== plan.pricePaise || membershipCredits(current.benefits) !== credits) {
      throw new MembershipCheckoutError('Plan changed. Please reload and try again.', 409)
    }
    const membership = await tx.vIPMembership.create({ data: { userId, planId: plan.id, subscriptionId: sub.id, status: 'pending' } })
    await tx.payment.create({ data: {
      id: membershipQuoteId(membership.id), userId, gateway: 'razorpay', type: 'MEMBERSHIP',
      status: 'pending', statusEnum: 'PENDING', amountPaise: plan.pricePaise, currency: 'INR',
      metadata: { kind: 'membership', membershipId: membership.id, subscriptionId: sub.id, razorpayPlanId: plan.razorpayPlanId, credits, shortUrl },
    } })
    return { id: sub.id, shortUrl }
  })
}
