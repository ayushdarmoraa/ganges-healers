import { auth } from '@/lib/auth'
import { hasVipAccess } from '@/lib/memberships/access'

interface StatusError extends Error { status?: number }

/**
 * Verify user has VIP community access.
 * Reads current membership status and expiry; preserves accounts granted manual VIP access.
 */
export async function requireVIP() {
  const session = await auth()

  if (!session?.user?.id) {
    const err: StatusError = new Error('Unauthorized')
    err.status = 401
    throw err
  }

  if (await hasVipAccess(session.user.id)) return session

  const err: StatusError = new Error('Community access requires VIP membership.')
  err.status = 403
  throw err
}
