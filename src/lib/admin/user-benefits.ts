import { createHash } from 'node:crypto'
import { Prisma, type User } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const userBenefitsSelect = { id: true, email: true, name: true, role: true, vip: true, freeSessionCredits: true, updatedAt: true } as const
type Snapshot = Pick<User, keyof typeof userBenefitsSelect>
export type UserBenefitsRecord = { id: string; vip: boolean; freeSessionCredits: number; version: string }
export const userBenefitsSchema = z.object({
  userId: z.string().min(1).max(200),
  version: z.string().regex(/^[a-f0-9]{64}$/),
  vip: z.boolean(),
  freeSessionCredits: z.number().int().min(0).max(2147483647),
  reason: z.string().trim().min(1).max(300),
}).strict()
export type UserBenefitsInput = z.infer<typeof userBenefitsSchema>
export type UserBenefitsResult = { success: true; changed: boolean; user: UserBenefitsRecord } | { success: false; error: string; code: string }

export class UserBenefitsError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); this.name = 'UserBenefitsError' }
}

/** Bind edits to the reviewed identity and balance, including changes sharing a timestamp. */
export function userBenefitsVersion(user: Snapshot) {
  return createHash('sha256').update(JSON.stringify([user.id, user.email, user.name, user.role, user.vip, user.freeSessionCredits, user.updatedAt])).digest('hex')
}

/** Serialize manual benefits with account/booking updates and commit their audit atomically. */
export async function updateUserBenefits(actorId: string, raw: UserBenefitsInput) {
  const parsed = userBenefitsSchema.safeParse(raw)
  if (!parsed.success) throw new UserBenefitsError('Enter a valid whole-number credit balance, VIP choice and reason for change.', 400, 'INVALID_BENEFITS')
  const input = parsed.data
  return prisma.$transaction(async tx => {
    // Stable lock order also handles two administrators editing each other without deadlocking.
    const ids = [...new Set([actorId, input.userId])].sort()
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } })
    if (actor?.role !== 'ADMIN') throw new UserBenefitsError('Administrator access is required.', 403, 'FORBIDDEN')
    const user = await tx.user.findUnique({ where: { id: input.userId }, select: userBenefitsSelect })
    if (!user) throw new UserBenefitsError('This account no longer exists. Reload the user list.', 404, 'USER_NOT_FOUND')
    if (userBenefitsVersion(user) !== input.version) throw new UserBenefitsError('This account or credit balance changed. Reload the user list and review the current values.', 409, 'USER_BENEFITS_CHANGED')
    if (user.vip === input.vip && user.freeSessionCredits === input.freeSessionCredits) return { changed: false, user: { id: user.id, vip: user.vip, freeSessionCredits: user.freeSessionCredits, version: input.version } }
    const updated = await tx.user.update({ where: { id: user.id }, data: { vip: input.vip, freeSessionCredits: input.freeSessionCredits }, select: userBenefitsSelect })
    await tx.activityLog.create({ data: {
      userId: actorId, action: 'user_benefits_updated', entityType: 'user', entityId: user.id,
      metadata: { before: { vip: user.vip, freeSessionCredits: user.freeSessionCredits }, after: { vip: updated.vip, freeSessionCredits: updated.freeSessionCredits }, reason: input.reason },
    } })
    return { changed: true, user: { id: updated.id, vip: updated.vip, freeSessionCredits: updated.freeSessionCredits, version: userBenefitsVersion(updated) } }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 10000 })
}
