import type { MembershipStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Retain manual VIP accounts; once subscriptions exist their current lifecycle and expiry govern access. */
export function membershipAccess(manualVip: boolean, memberships: Array<{ status: MembershipStatus; endDate: Date | null }>, now = new Date()) {
  return memberships.length === 0 ? manualVip : memberships.some(m => m.status === 'active' && (!m.endDate || m.endDate > now))
}

/** Read current access rather than trusting a session's cached VIP flag. Also usable inside a booking transaction. */
export async function hasVipAccess(userId: string, db: Pick<Prisma.TransactionClient, 'user'> = prisma) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { vip: true, memberships: { select: { status: true, endDate: true } } } })
  return !!user && membershipAccess(user.vip, user.memberships)
}
