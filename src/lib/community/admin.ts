import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'
import { isTestMode } from '@/lib/test-mode'

/** Moderation writes need a real, currently authorized actor for their audit trail. */
export async function requireCommunityAdmin() {
  const session = await requireAdmin()
  const actorId = isTestMode() && session.user?.id === 'test-admin'
    ? (await auth())?.user?.id
    : session.user?.id
  if (actorId) {
    const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, role: true } })
    if (actor?.role === 'ADMIN') return actor
  }
  throw Object.assign(new Error('Forbidden: admin only'), { status: 403 })
}
