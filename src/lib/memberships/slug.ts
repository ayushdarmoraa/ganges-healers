// Single source of truth for VIP membership plan slugs
export const CANONICAL_SLUGS = ['vip-monthly', 'vip-yearly'] as const
export type CanonicalPlanSlug = (typeof CANONICAL_SLUGS)[number]

// Map friendly aliases to canonical slugs
const ALIAS_MAP: Record<string, CanonicalPlanSlug> = {
  monthly: 'vip-monthly',
  yearly: 'vip-yearly',
}

export function isCanonicalSlug(s: string): s is CanonicalPlanSlug {
  return (CANONICAL_SLUGS as readonly string[]).includes(s)
}

export function canonicalizePlanSlug(input: string): CanonicalPlanSlug | null {
  const s = (input ?? '').toString().trim().toLowerCase()
  if (isCanonicalSlug(s)) return s
  if (s in ALIAS_MAP) return ALIAS_MAP[s]
  return null
}
