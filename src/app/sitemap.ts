import type { MetadataRoute } from 'next'
import { getSitemapItems } from '@/lib/seo/sitemap'
import { canonicalOf } from '@/config/site'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dynamicItems = await getSitemapItems()
  const rootItems: MetadataRoute.Sitemap = [
    { url: canonicalOf('/') + '/', changeFrequency: 'weekly', priority: 1, lastModified: new Date() },
    { url: canonicalOf('/about'), changeFrequency: 'monthly', priority: 0.5 },
  ]
  // Next expects absolute URLs with optional fields
  return [...rootItems, ...dynamicItems]
}
