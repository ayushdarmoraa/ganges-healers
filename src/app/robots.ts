import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/config/site'

export default function robots(): MetadataRoute.Robots {
  const base = SITE_URL.replace(/\/$/, '')
  // Preview/sandbox safety toggle: disallow all
  if ((process.env.NEXT_PUBLIC_ROBOTS || 'production') === 'disallow_all') {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: `${base}/sitemap.xml`,
    }
  }
  // Default production policy: disallow private surfaces; allow others by omission
  return {
    rules: {
      userAgent: '*',
      disallow: [
        '/api/',
        '/admin/',
        '/dashboard/',
        '/auth/',
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
