import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Remove provided query keys from a URL/href while preserving path and other params
export function clearSearchParams(href: string, keys: string[]) {
  try {
    const url = new URL(href, 'http://localhost')
    for (const k of keys) url.searchParams.delete(k)
    const query = url.searchParams.toString()
    return query ? `${url.pathname}?${query}` : url.pathname
  } catch {
    // Fallback for relative paths without base
    const [path, qs] = href.split('?')
    if (!qs) return path
    const sp = new URLSearchParams(qs)
    for (const k of keys) sp.delete(k)
    const query = sp.toString()
    return query ? `${path}?${query}` : path
  }
}
