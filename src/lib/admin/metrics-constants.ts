export const BY_TYPE_KEYS = ['SESSION','PROGRAM','MEMBERSHIP','STORE','COURSE'] as const

export type ByTypeKey = (typeof BY_TYPE_KEYS)[number]

// Ensures exactly the 5 canonical keys exist with number values; missing/null/undefined → 0; strips unknown keys
export function ensureByTypeKeys<T extends number | null | undefined>(obj: Record<string, T>): Record<ByTypeKey, number> {
  const out = Object.create(null) as Record<ByTypeKey, number>
  for (const k of BY_TYPE_KEYS) {
    const v = obj?.[k]
    out[k] = typeof v === 'number' && Number.isFinite(v) ? v : 0
  }
  return out
}
