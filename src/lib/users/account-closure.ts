import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { recentAuthenticationExpiresAt, sessionCredentialVersion, type RecentAuthentication } from '@/lib/auth/password-version'

export class AccountClosureError extends Error {
  constructor(message: string, public status = 409, public code = 'ACCOUNT_CHANGED') { super(message) }
}
const selection = { id: true, password: true, securityVersion: true, role: true, closedAt: true, updatedAt: true, healer: { select: { id: true } } } as const
type Account = Prisma.UserGetPayload<{ select: typeof selection }>
type Blocker = { code: 'STAFF' | 'BOOKINGS' | 'MEMBERSHIPS' | 'PROGRAMS' | 'ORDERS' | 'PAYMENTS'; message: string }
function requireOpen(user: Account | null): asserts user is Account {
  if (!user || user.closedAt) throw new AccountClosureError('This account is unavailable. Sign in again if needed.', 401, 'UNAUTHORIZED')
}
async function review(tx: Prisma.TransactionClient, user: Account, authentication: RecentAuthentication | undefined) {
  const now = new Date()
  const [bookings, memberships, programs, orders, payments] = await Promise.all([
    tx.$queryRaw<Array<{ present: boolean }>>`SELECT EXISTS (SELECT 1 FROM "Booking" WHERE "userId" = ${user.id} AND "status" IN ('PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED') AND "scheduledAt" + "durationMin" * interval '1 minute' > ${now}) AS "present"`,
    tx.vIPMembership.findFirst({ where: { userId: user.id, status: { not: 'cancelled' } }, select: { id: true } }),
    tx.programEnrollment.findFirst({ where: { userId: user.id, status: { in: ['active', 'paused'] } }, select: { id: true } }),
    tx.order.findFirst({ where: { userId: user.id, status: { notIn: ['pending_payment', 'delivered', 'fulfilled', 'cancelled', 'refunded'] } }, select: { id: true } }),
    tx.payment.findFirst({ where: { userId: user.id, OR: [{ statusEnum: 'PROCESSING' }, { status: 'processing' }] }, select: { id: true } }),
  ])
  const blockers: Blocker[] = []
  if (user.role !== 'USER' || user.healer) blockers.push({ code: 'STAFF', message: 'Contact an administrator to transfer staff responsibilities before closing this account.' })
  if (bookings[0]?.present) blockers.push({ code: 'BOOKINGS', message: 'Finish or cancel your upcoming or ongoing bookings first.' })
  if (memberships) blockers.push({ code: 'MEMBERSHIPS', message: 'Cancel your membership subscriptions and wait for cancellation confirmation first.' })
  if (programs) blockers.push({ code: 'PROGRAMS', message: 'Finish or cancel your active and paused programs first.' })
  if (orders) blockers.push({ code: 'ORDERS', message: 'Resolve your open store orders first.' })
  if (payments) blockers.push({ code: 'PAYMENTS', message: 'Wait for your processing payments to finish first.' })
  const expires = recentAuthenticationExpiresAt(user.id, sessionCredentialVersion(user.password, user.securityVersion), authentication, now.getTime())
  return {
    ownerId: user.id,
    reviewVersion: createHash('sha256').update(JSON.stringify([user.id, user.role, user.updatedAt.toISOString(), user.securityVersion, blockers.map(item => item.code)])).digest('hex'),
    blockers, reauthenticate: !expires, expiresAt: expires ? new Date(expires).toISOString() : null,
  }
}

/** Private current-owner review; it does not cancel, erase or close anything. */
export async function accountClosureStatus(userId: string, authentication?: RecentAuthentication) {
  return prisma.$transaction(async tx => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: selection })
    requireOpen(user)
    return review(tx, user, authentication)
  })
}

/** Recheck the review and signed recent login under the account/row locks, then revoke access and audit atomically. */
export async function closeOwnAccount(userId: string, expectedVersion: string, authentication?: RecentAuthentication) {
  const closedAt = await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'account', userId)
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`
    const user = await tx.user.findUnique({ where: { id: userId }, select: selection })
    requireOpen(user)
    const status = await review(tx, user, authentication)
    if (status.reauthenticate) throw new AccountClosureError('Sign in again before closing your account. Your existing sign-in and authenticator rules still apply.', 403, 'REAUTHENTICATE')
    if (status.reviewVersion !== expectedVersion) throw new AccountClosureError('Your account changed. Refresh the closure review before confirming again.')
    if (status.blockers.length) throw new AccountClosureError('Resolve the items in your closure review first.', 409, 'ACCOUNT_IN_USE')
    const now = new Date()
    const changed = await tx.user.updateMany({ where: { id: userId, closedAt: null, role: 'USER', password: user.password, securityVersion: user.securityVersion, updatedAt: user.updatedAt }, data: { closedAt: now, securityVersion: { increment: 1 } } })
    if (changed.count !== 1) throw new AccountClosureError('Your account changed. Refresh the closure review before confirming again.')
    await tx.session.deleteMany({ where: { userId } })
    await tx.verificationToken.deleteMany({ where: { OR: [
      { identifier: { startsWith: `password-reset:${userId}:` } },
      { identifier: { startsWith: `email-verification:${userId}:` } },
    ] } })
    await tx.phoneVerification.updateMany({ where: { userId }, data: { providerId: null, expiresAt: now, checkingId: null, checkingUntil: null } })
    await tx.activityLog.create({ data: { userId, action: 'account_closed', entityType: 'USER', entityId: userId, metadata: { method: 'self_service', retainedHistory: true } } })
    return now.toISOString()
  }, { maxWait: 10000, timeout: 15000 })
  console.info('[users][account][closed]')
  return { ownerId: userId, closed: true as const, closedAt }
}
