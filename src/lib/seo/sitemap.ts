import { prisma } from '@/lib/prisma'
import { canonicalOf } from '@/config/site'

export type SitemapItem = {
  url: string
  lastModified?: string | Date
  changeFrequency?: 'daily' | 'weekly' | 'monthly'
  priority?: number
}

export async function getSitemapItems(): Promise<SitemapItem[]> {
  // Helper: run a query and return [] if the table doesn't exist yet (P2021)
  async function safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try { return await fn() } catch { return [] }
  }

  const [services, programs, healers, courses, products, blogPosts, audioTracks] = await Promise.all([
    safe(() => prisma.service.findMany({
      select: { slug: true, updatedAt: true },
    })) as Promise<Array<{ slug?: string; updatedAt?: Date | null }>>,
    safe(() => prisma.program.findMany({
      select: { slug: true, updatedAt: true },
    })) as Promise<Array<{ slug?: string; updatedAt?: Date | null }>>,
    safe(() => prisma.healer.findMany({
      select: { id: true, updatedAt: true },
    })),
    safe(() => prisma.course.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    })),
    safe(() => prisma.product.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    })),
    safe(() => prisma.blogPost.findMany({
      where: { published: true },
      select: { slug: true, updatedAt: true },
    })),
    safe(() => prisma.audioTrack.findMany({
      where: { isPublished: true },
      select: { slug: true, createdAt: true },
    })),
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
      url: canonicalOf(`/healers/${h.id}`),
      lastModified: h.updatedAt ?? now,
      changeFrequency: 'weekly',
      priority: 0.8,
    }))

  const listItems: SitemapItem[] = [
    { url: canonicalOf('/services'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
    { url: canonicalOf('/programs'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
    { url: canonicalOf('/healers'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
    { url: canonicalOf('/courses'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
    { url: canonicalOf('/store'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
    { url: canonicalOf('/blog'), changeFrequency: 'daily', priority: 0.6, lastModified: now },
    { url: canonicalOf('/audio'), changeFrequency: 'weekly', priority: 0.6, lastModified: now },
  ]

  const courseItems: SitemapItem[] = courses
    .filter((c) => !!c.slug)
    .map((c) => ({
      url: canonicalOf(`/courses/${c.slug}`),
      lastModified: c.updatedAt ?? now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))

  const productItems: SitemapItem[] = products
    .filter((p) => !!p.slug)
    .map((p) => ({
      url: canonicalOf(`/store/${p.slug}`),
      lastModified: p.updatedAt ?? now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))

  const blogItems: SitemapItem[] = blogPosts
    .filter((b) => !!b.slug)
    .map((b) => ({
      url: canonicalOf(`/blog/${b.slug}`),
      lastModified: b.updatedAt ?? now,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    }))

  const audioItems: SitemapItem[] = audioTracks
    .filter((a) => !!a.slug)
    .map((a) => ({
      url: canonicalOf(`/audio/${a.slug}`),
      lastModified: a.createdAt ?? now,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    }))

  return [...listItems, ...svcItems, ...programItems, ...healerItems, ...courseItems, ...productItems, ...blogItems, ...audioItems]
}
