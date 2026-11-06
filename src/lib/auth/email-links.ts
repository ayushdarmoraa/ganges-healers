/** Auth email destinations come from trusted server configuration, never an incoming Host header. */
export function trustedAuthEmailOrigin(environment: NodeJS.ProcessEnv = process.env): string | null {
  const configured = environment.AUTH_URL || environment.NEXTAUTH_URL || environment.NEXT_PUBLIC_SITE_URL ||
    (environment.VERCEL_URL ? `https://${environment.VERCEL_URL}` : undefined)
  if (!configured) return null
  try {
    const url = new URL(configured)
    const localDevelopment = environment.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(localDevelopment && url.protocol === 'http:'))) return null
    return url.origin
  } catch { return null }
}
