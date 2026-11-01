import { prisma } from '@/lib/prisma'

/** Fresh reads keep publication changes consistent across application instances. */
export function getPublishedBlogSummaries(take?: number) {
  return prisma.blogPost.findMany({
    where: { published: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...(take ? { take } : {}),
    select: { id: true, slug: true, title: true, excerpt: true, imageUrl: true, createdAt: true },
  })
}

/** Keep the existing ID-or-slug public lookup, always restricted to published content. */
export function getPublishedBlogPost(slug: string) {
  return prisma.blogPost.findFirst({ where: { OR: [{ id: slug }, { slug }], published: true } })
}
