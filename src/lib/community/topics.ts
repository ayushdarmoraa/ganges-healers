import { prisma } from '@/lib/prisma'

const topicFields = { id: true, slug: true, name: true, description: true } as const

/** Active topics shared by the directory, topic pages, and authenticated API. */
export function getCommunityTopics() {
  return prisma.communityTopic.findMany({
    where: { isActive: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: topicFields,
  })
}

/** Resolve only active topics so hidden topics cannot be opened by slug. */
export function getCommunityTopic(slug: string) {
  return prisma.communityTopic.findFirst({
    where: { slug, isActive: true },
    select: topicFields,
  })
}
