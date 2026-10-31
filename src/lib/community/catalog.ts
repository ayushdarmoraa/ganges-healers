import { createHash } from 'crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'

export type CatalogKind = 'topic' | 'tag'
export interface CatalogItem {
  id: string
  kind: CatalogKind
  slug: string
  name: string
  description: string | null
  order: number | null
  isActive: boolean | null
  postCount: number
  createdAt: string
  version: string
}

export class CommunityCatalogError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
    this.name = 'CommunityCatalogError'
  }
}

const name = z.string().trim().min(1, 'A name is required').max(100)
const slug = z.string().trim().toLowerCase().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens')
const topicChanges = z.object({
  name,
  description: z.string().trim().max(1000),
  order: z.number().int().min(-1000000).max(1000000),
  isActive: z.boolean(),
}).partial().strict().refine(value => Object.keys(value).length > 0, 'At least one change is required')
const tagChanges = z.object({ name }).partial().strict().refine(value => Object.keys(value).length > 0, 'At least one change is required')
export const createCatalogSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('topic'), slug, name, description: z.string().trim().max(1000).default(''), order: z.number().int().min(-1000000).max(1000000).default(0), isActive: z.boolean().default(true) }).strict(),
  z.object({ kind: z.literal('tag'), slug, name }).strict(),
])
const identity = { id: z.string().min(1), version: z.string().regex(/^[a-f0-9]{64}$/) }
export const updateCatalogSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('topic'), ...identity, changes: topicChanges }).strict(),
  z.object({ kind: z.literal('tag'), ...identity, changes: tagChanges }).strict(),
])
export const catalogQuerySchema = z.object({
  kind: z.enum(['topic', 'tag']).default('topic'),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  q: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
})

type Topic = Prisma.CommunityTopicGetPayload<{ include: { _count: { select: { posts: true } } } }>
type Tag = Prisma.CommunityTagGetPayload<{ include: { _count: { select: { posts: true } } } }>
const include = { _count: { select: { posts: true } } } as const

/** Versions cover editable fields, so a new discussion does not invalidate a name edit. */
function catalogItem(kind: CatalogKind, row: Topic | Tag): CatalogItem {
  const fields = 'isActive' in row
    ? { name: row.name, slug: row.slug, description: row.description, order: row.order, isActive: row.isActive }
    : { name: row.name, slug: row.slug, description: null, order: null, isActive: null }
  return {
    id: row.id, kind, ...fields, createdAt: row.createdAt.toISOString(), postCount: row._count.posts,
    version: createHash('sha256').update(JSON.stringify([kind, row.id, fields])).digest('hex'),
  }
}

/** Admin listing includes inactive topics and all linked discussions, including hidden ones. */
export async function listCommunityCatalog(query: z.infer<typeof catalogQuerySchema>) {
  const search = query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' as const } }, { slug: { contains: query.q, mode: 'insensitive' as const } }] } : {}
  const page = { take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), include }
  const rows = query.kind === 'topic'
    ? await prisma.communityTopic.findMany({ ...page, where: { ...search, ...(query.status !== 'all' ? { isActive: query.status === 'active' } : {}) }, orderBy: [{ order: 'asc' }, { name: 'asc' }, { id: 'asc' }] })
    : await prisma.communityTag.findMany({ ...page, where: search, orderBy: [{ name: 'asc' }, { id: 'asc' }] })
  const hasMore = rows.length > query.limit
  if (hasMore) rows.pop()
  return { data: rows.map(row => catalogItem(query.kind, row)), nextCursor: hasMore ? rows.at(-1)?.id || null : null }
}

/** Creation and auditing commit together; the slug stays stable for the record's lifetime. */
export async function createCommunityCatalog(actorId: string, input: z.infer<typeof createCatalogSchema>) {
  try {
    return await prisma.$transaction(async tx => {
      await lockTransaction(tx, 'community', `catalog:${input.kind}:slug:${input.slug}`)
      const where = { slug: { equals: input.slug, mode: 'insensitive' as const } }
      const existing = input.kind === 'topic' ? await tx.communityTopic.findFirst({ where }) : await tx.communityTag.findFirst({ where })
      if (existing) throw new CommunityCatalogError('This URL slug is already in use. Choose another.', 409, 'SLUG_UNAVAILABLE')
      const row = input.kind === 'topic'
        ? await tx.communityTopic.create({ data: { slug: input.slug, name: input.name, description: input.description || null, order: input.order, isActive: input.isActive }, include })
        : await tx.communityTag.create({ data: { slug: input.slug, name: input.name }, include })
      await tx.activityLog.create({ data: { userId: actorId, action: `community_${input.kind}_created`, entityType: `community_${input.kind}`, entityId: row.id, metadata: { slug: row.slug } } })
      return { data: catalogItem(input.kind, row) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new CommunityCatalogError('This URL slug is already in use. Choose another.', 409, 'SLUG_UNAVAILABLE')
    throw error
  }
}

/** Locks and field versions prevent concurrent admin edits from silently overwriting each other. */
export async function updateCommunityCatalog(actorId: string, input: z.infer<typeof updateCatalogSchema>) {
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'community', `catalog:${input.kind}:${input.id}`)
    if (input.kind === 'topic') await tx.$queryRaw`SELECT "id" FROM "CommunityTopic" WHERE "id" = ${input.id} FOR UPDATE`
    else await tx.$queryRaw`SELECT "id" FROM "CommunityTag" WHERE "id" = ${input.id} FOR UPDATE`
    const current = input.kind === 'topic'
      ? await tx.communityTopic.findUnique({ where: { id: input.id }, include })
      : await tx.communityTag.findUnique({ where: { id: input.id }, include })
    if (!current) throw new CommunityCatalogError('This item no longer exists. Refresh the list.', 404)
    const snapshot = catalogItem(input.kind, current)
    if (snapshot.version !== input.version) throw new CommunityCatalogError('Another admin changed this item. Refresh the list before saving.', 409, 'CATALOG_CHANGED')
    const changes = input.changes
    const fields = Object.keys(changes).filter(field => {
      const key = field as keyof CatalogItem
      const value = changes[field as keyof typeof changes]
      return (key === 'description' ? snapshot.description || '' : snapshot[key]) !== value
    })
    if (!fields.length) return { data: snapshot, idempotent: true }
    const row = input.kind === 'topic'
      ? await tx.communityTopic.update({ where: { id: input.id }, data: input.changes, include })
      : await tx.communityTag.update({ where: { id: input.id }, data: input.changes, include })
    await tx.activityLog.create({ data: { userId: actorId, action: `community_${input.kind}_updated`, entityType: `community_${input.kind}`, entityId: row.id, metadata: { changedFields: fields } } })
    return { data: catalogItem(input.kind, row), idempotent: false }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}

/** Shared row locks allow parallel publishing while coordinating with topic deactivation. */
export async function requireActivePublishingTopic(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "CommunityTopic" WHERE "id" = ${id} FOR SHARE`
  if (!await tx.communityTopic.findFirst({ where: { id, isActive: true }, select: { id: true } })) {
    throw new CommunityCatalogError('This topic is no longer available. Please choose another topic.', 400, 'TOPIC_UNAVAILABLE')
  }
}
