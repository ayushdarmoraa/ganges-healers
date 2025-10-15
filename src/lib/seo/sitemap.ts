import { prisma } from '@/lib/prisma'
import { canonicalOf } from '@/config/site'

export type SitemapItem = {
  url: string
  lastModified?: string | Date
  changeFrequency?: 'daily' | 'weekly' | 'monthly'
  priority?: number
}

export async function getSitemapItems(): Promise<SitemapItem[]> {
  // Query minimal fields only; tolerate absent columns by using loose typing
  const [services, programs, healers] = await Promise.all([
    prisma.service.findMany({
      select: { slug: true, updatedAt: true },
    }) as Promise<Array<{ slug?: string; updatedAt?: Date | null }>>,
    prisma.program.findMany({
      select: { slug: true, updatedAt: true },
    }) as Promise<Array<{ slug?: string; updatedAt?: Date | null }>>,
    // Bypass Prisma type constraints to optionally read slug when present
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as any).healer.findMany({
      select: { id: true, slug: true, updatedAt: true },
    }) as Promise<Array<{ id: string; slug?: string; updatedAt?: Date | null }>>,
  ])

  const now = new Date()

  const svcItems: SitemapItem[] = services
    .filter((s) => !!s.slug)
    .map((s) => ({
      url: canonicalOf(`/services/${s.slug}`),
      lastModified: s.updatedAt ?? now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

  const programItems: SitemapItem[] = programs
    .filter((p) => !!p.slug)
    .map((p) => ({
      url: canonicalOf(`/programs/${p.slug}`),
      lastModified: p.updatedAt ?? now,
      changeFrequency: 'monthly',
      priority: 0.8,
    }))

  const healerItems: SitemapItem[] = healers
    .map((h) => ({
      url: canonicalOf(`/healers/${(h.slug ?? h.id)}`),
      lastModified: h.updatedAt ?? now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

  const listItems: SitemapItem[] = [
    { url: canonicalOf('/services'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
    { url: canonicalOf('/programs'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
    { url: canonicalOf('/healers'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
  ]

  return [...listItems, ...svcItems, ...programItems, ...healerItems]
}
