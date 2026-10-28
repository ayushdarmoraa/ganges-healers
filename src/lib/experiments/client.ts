// This module must remain free of server imports so checkout can read its cookies.
export const EXPERIMENT_COOKIE_PREFIX = 'ghx_'
export type Variant = 'A' | 'B'

/** Read an assigned variant in the browser; return null during server rendering. */
export function readVariantClient(experimentKey: string): Variant | null {
  if (typeof document === 'undefined') return null
  const cookieName = `${EXPERIMENT_COOKIE_PREFIX}${experimentKey}`
  const match = document.cookie.match(new RegExp(`(?:^|; )${cookieName}=([AB])`))
  return (match?.[1] as Variant) ?? null
}

/** Read active browser variant cookies without importing server request context. */
export function readAllVariantsClient(): Record<string, Variant> {
  if (typeof document === 'undefined') return {}
  const variants: Record<string, Variant> = {}
  for (const part of document.cookie.split('; ')) {
    if (part.startsWith(EXPERIMENT_COOKIE_PREFIX)) {
      const [name, value] = part.split('=')
      if (value === 'A' || value === 'B') {
        variants[name.slice(EXPERIMENT_COOKIE_PREFIX.length)] = value as Variant
      }
    }
  }
  return variants
}
