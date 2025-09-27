import { auth } from '@/lib/auth'

/** Ensure current user is ADMIN; throws with status 403 otherwise */
interface StatusError extends Error { status?: number }

export async function requireAdmin() {
  // Short-circuit in test mode BEFORE calling auth() to avoid noisy JWT decode errors.
  if (process.env.TEST_MODE === '1') {
    console.warn('[auth][admin][bypass_test_mode]')
    return {
      user: {
        id: 'test-admin',
        email: 'admin@test.local',
        role: 'ADMIN',
        vip: true,
        freeSessionCredits: 0,
        name: 'Test Admin'
      }
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  const session = await auth()
  if (session?.user && session.user.role === 'ADMIN') return session

  const err: StatusError = new Error('Forbidden: admin only')
  err.status = 403
  throw err
}
