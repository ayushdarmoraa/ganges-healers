import { cookies } from 'next/headers'

const SESSION_COOKIE = 'gh_sid'

/** Read the anonymous session ID from the request cookie (set by middleware). */
export async function getSessionId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(SESSION_COOKIE)?.value ?? null
}

/** Read all active experiment variant cookies (ghx_*). */
export async function getExperimentVariants(): Promise<Record<string, string>> {
  const cookieStore = await cookies()
  const variants: Record<string, string> = {}
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith('ghx_') && (c.value === 'A' || c.value === 'B')) {
      variants[c.name.slice(4)] = c.value
    }
  }
  return variants
}
