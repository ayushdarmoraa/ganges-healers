import { prisma } from '@/lib/prisma'

const tagFields = { id: true, slug: true, name: true } as const

/** Use the same tag directory for browsing and composer choices. */
export function getCommunityTags() {
  return prisma.communityTag.findMany({ orderBy: { name: 'asc' }, select: tagFields })
}

export function getCommunityTag(slug: string) {
  return prisma.communityTag.findUnique({ where: { slug }, select: tagFields })
}
