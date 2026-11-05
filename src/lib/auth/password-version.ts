import { createHash } from 'node:crypto'

/** Bind a session or recovery link to the current stored credential without exposing its hash. */
export function passwordVersion(password: string | null | undefined) {
  return createHash('sha256').update(password ? `password:${password}` : 'no-password').digest('hex')
}

/** Security configuration changes revoke sessions without changing password-reset link semantics. */
export function sessionCredentialVersion(password: string | null | undefined, securityVersion = 0) {
  const version = passwordVersion(password)
  return securityVersion > 0 ? createHash('sha256').update(`session:${version}:${securityVersion}`).digest('hex') : version
}
