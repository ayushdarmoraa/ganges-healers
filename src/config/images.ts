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

// Leave room for multipart framing below Vercel's 4.5 MB request limit.
export const PRODUCT_IMAGE_MAX_BYTES = 4 * 1024 * 1024
export const PRODUCT_GALLERY_LIMIT = 8
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Validate stored product photos as well as uploads; existing catalog rows are untouched. */
export function productImageFields(imageUrl: string, gallery: unknown): { imageUrl: string | null; gallery: string[] } {
  const primary = imageUrl.trim()
  const allowed = (url: unknown): url is string => typeof url === 'string' && url.length > 0 && url.length <= 2000 && isAllowedArticleImage(url)
  if (primary && !allowed(primary)) throw new Error('Choose a supported HTTPS product image.')
  if (!Array.isArray(gallery) || gallery.length > PRODUCT_GALLERY_LIMIT || !gallery.every(allowed)) throw new Error('Choose up to eight supported HTTPS gallery images.')
  return { imageUrl: primary || null, gallery }
}

/** Shared browser/server checks; server additionally checks the file signature. */
export function productImageError(file: { size: number; type: string }): string | null {
  if (!(PRODUCT_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Choose a JPEG, PNG or WebP image.'
  if (file.size === 0) return 'The image is empty. Choose another file.'
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return 'Images must be 4 MB or smaller.'
  return null
}

/** Reject obvious disguised files; this is a format signature check, not a full image decoder. */
export function hasProductImageSignature(bytes: Uint8Array, type: string): boolean {
  if (type === 'image/jpeg') return bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (type === 'image/png') return bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  if (type === 'image/webp') return bytes.length >= 16 && [82, 73, 70, 70].every((value, index) => bytes[index] === value) && [87, 69, 66, 80].every((value, index) => bytes[index + 8] === value)
  return false
}
