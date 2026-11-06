import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/** Bind a session or recovery link to the current stored credential without exposing its hash. */
export function passwordVersion(password: string | null | undefined) {
  return createHash('sha256').update(password ? `password:${password}` : 'no-password').digest('hex')
}

/** Security configuration changes revoke sessions without changing password-reset link semantics. */
export function sessionCredentialVersion(password: string | null | undefined, securityVersion = 0) {
  const version = passwordVersion(password)
  return securityVersion > 0 ? createHash('sha256').update(`session:${version}:${securityVersion}`).digest('hex') : version
}

export type RecentAuthentication = { issuedAt: number; proof: string }
const RECENT_AUTH_MS = 5 * 60_000
function recentProof(userId: string, version: string, issuedAt: number) {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  return secret ? createHmac('sha256', secret).update(JSON.stringify(['account-closure', userId, version, issuedAt])).digest('hex') : null
}

/** Issued only after normal sign-in, including its existing factor checks; session refresh never renews it. */
export function createRecentAuthentication(userId: string, version: string, issuedAt = Date.now()): RecentAuthentication | undefined {
  const proof = recentProof(userId, version, issuedAt)
  return proof ? { issuedAt, proof } : undefined
}

/** Recheck the signed login's age and current credential/factor version inside the account transaction. */
export function recentAuthenticationExpiresAt(userId: string, version: string, value: RecentAuthentication | undefined, now = Date.now()): number | null {
  if (!value || !Number.isSafeInteger(value.issuedAt) || value.issuedAt > now + 30_000 || value.issuedAt + RECENT_AUTH_MS <= now || typeof value.proof !== 'string' || !/^[a-f0-9]{64}$/.test(value.proof)) return null
  const expected = recentProof(userId, version, value.issuedAt)
  return expected && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(value.proof, 'hex')) ? value.issuedAt + RECENT_AUTH_MS : null
}
