/** Shared with Next/Image and admin image validation. */
export const imageRemotePatterns = [
  { protocol: 'https' as const, hostname: '**.public.blob.vercel-storage.com' },
  { protocol: 'https' as const, hostname: '**.vercel-storage.com' },
  { protocol: 'https' as const, hostname: 'lh3.googleusercontent.com' },
  { protocol: 'https' as const, hostname: 'avatars.githubusercontent.com' },
]

/** Only configured HTTPS image hosts are accepted; no credentials or custom ports. */
export function isAllowedArticleImage(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    if (url.username || url.password || url.port) return false
    return imageRemotePatterns.some(pattern => {
      const host = pattern.hostname
      return url.protocol === `${pattern.protocol}:` && (host.startsWith('**.')
        ? url.hostname.endsWith(host.slice(2)) && url.hostname.length > host.slice(2).length
        : url.hostname === host)
    })
  } catch { return false }
}
