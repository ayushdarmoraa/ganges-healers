import { createHash } from 'node:crypto'

/** Bind a session or recovery link to the current stored credential without exposing its hash. */
export function passwordVersion(password: string | null | undefined) {
  return createHash('sha256').update(password ? `password:${password}` : 'no-password').digest('hex')
}
