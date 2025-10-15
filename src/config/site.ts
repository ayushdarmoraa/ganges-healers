export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://<your-prod-domain>'

export function canonicalOf(path: string, stripParams: string[] = []): string {
  const basePref = (process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL)
  try {
    const url = new URL(path, basePref)
    if (stripParams?.length) {
      for (const key of stripParams) url.searchParams.delete(key)
    }
    return url.toString().replace(/\/$/, '')
  } catch {
    // Fallback: construct by simple concat to preserve path even if base is placeholder/invalid
    const base = basePref.replace(/\/$/, '')
    const p = path.startsWith('/') ? path : `/${path}`
    return `${base}${p}`
  }
}
