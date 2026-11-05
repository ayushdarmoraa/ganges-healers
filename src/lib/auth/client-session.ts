import { signOut } from 'next-auth/react'

/** Confirm cookie-backed sign-out; callers navigate using their own validated local route. */
export async function signOutCurrentSession(redirectTo: string) {
  const result = await signOut({ redirect: false, redirectTo })
  if (!result || typeof result.url !== 'string' || !result.url) throw new Error('Sign-out was not confirmed')
  // Auth.js v5's client does not inspect HTTP status. Never use its configured-host redirect here.
  const response = await fetch('/api/auth/session', { cache: 'no-store' })
  if (!response.ok) throw new Error('Session could not be checked')
  const remaining: unknown = await response.json()
  if (remaining !== null && (typeof remaining !== 'object' || Array.isArray(remaining) || Object.keys(remaining).length !== 0)) throw new Error('A session is still active')
}
