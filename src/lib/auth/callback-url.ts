const DEFAULT_CALLBACK = '/dashboard'
const CALLBACK_BASE = 'https://callback.invalid'

function hasUnsafeCharacters(value: string) {
  return [...value].some(char => char === '\\' || char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
}

/** Accept only unambiguous local page destinations; reject external redirects and authentication loops. */
export function safeCallbackUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//') || hasUnsafeCharacters(value)) return DEFAULT_CALLBACK
  try {
    const url = new URL(value, CALLBACK_BASE)
    const pathname = decodeURIComponent(url.pathname)
    if (url.origin !== CALLBACK_BASE || pathname.startsWith('//') || pathname.includes('%') || hasUnsafeCharacters(pathname)
      || pathname === '/auth' || pathname.startsWith('/auth/') || pathname === '/register' || pathname.startsWith('/register/')
      || pathname === '/api' || pathname.startsWith('/api/')) return DEFAULT_CALLBACK
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return DEFAULT_CALLBACK }
}

/** Preserve the ordinary auth links when no explicit journey needs restoring. */
export function authPathWithCallback(path: '/auth/signin' | '/register' | '/auth/reset-password', value: unknown) {
  const callbackUrl = safeCallbackUrl(value)
  return callbackUrl === DEFAULT_CALLBACK ? path : `${path}?${new URLSearchParams({ callbackUrl })}`
}
