import { createHash } from 'crypto'
import { Prisma, type BlogPost } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { isAllowedArticleImage } from '@/config/images'

export interface BlogSummary {
  id: string; slug: string; title: string; excerpt: string | null; imageUrl: string | null
  published: boolean; createdAt: string; updatedAt: string
}
export interface BlogArticle extends BlogSummary { content: string; version: string }
export class BlogAdminError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = 'BlogAdminError' }
}

const fields = {
  title: z.string().trim().min(1, 'A title is required').max(200),
  content: z.string().max(50000),
  excerpt: z.string().trim().max(500),
  imageUrl: z.string().trim().max(2000).refine(isAllowedArticleImage, 'Use an HTTPS image from the configured image hosts, or leave this empty'),
}
export const createBlogSchema = z.object({
  ...fields,
  content: fields.content.default(''), excerpt: fields.excerpt.default(''), imageUrl: fields.imageUrl.default(''),
  slug: z.string().trim().toLowerCase().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letters, numbers, and single hyphens'),
}).strict()
export const updateBlogSchema = z.object({
  id: z.string().min(1),
  version: z.string().regex(/^[a-f0-9]{64}$/),
  changes: z.object({ ...fields, published: z.boolean() }).partial().strict().refine(value => Object.keys(value).length > 0, 'At least one change is required'),
}).strict()
export const blogAdminQuerySchema = z.object({
  id: z.string().min(1).optional(), status: z.enum(['all', 'draft', 'published']).default('all'),
  q: z.string().trim().max(200).default(''), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: z.string().min(1).optional(),
})

const summaryFields = { id: true, slug: true, title: true, excerpt: true, imageUrl: true, published: true, createdAt: true, updatedAt: true } as const
function summary(row: Omit<BlogPost, 'content'>): BlogSummary {
  return { id: row.id, slug: row.slug, title: row.title, excerpt: row.excerpt, imageUrl: row.imageUrl, published: row.published, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}
function article(row: BlogPost): BlogArticle {
  const data = { ...summary(row), content: row.content }
  return { ...data, version: createHash('sha256').update(JSON.stringify(data)).digest('hex') }
}

/** Keep app-written articles searchable in schema-only databases as well as migrated ones. */
async function indexArticle(tx: Prisma.TransactionClient, id: string) {
  const vector = Prisma.sql`to_tsvector('english', coalesce("title", '') || ' ' || coalesce("content", '') || ' ' || coalesce("excerpt", ''))`
  // Existing migration triggers may already have produced this value; avoid a second row write.
  await tx.$executeRaw(Prisma.sql`UPDATE "BlogPost" SET "searchVector" = ${vector}
    WHERE "id" = ${id} AND "searchVector" IS DISTINCT FROM ${vector}`)
}

/** Lists fetch metadata only; full content and its version are loaded when an editor opens. */
export async function listBlogArticles(query: z.infer<typeof blogAdminQuerySchema>) {
  if (query.id) {
    const row = await prisma.blogPost.findUnique({ where: { id: query.id } })
    if (!row) throw new BlogAdminError('Article not found', 404)
    return { data: article(row) }
  }
  const where: Prisma.BlogPostWhereInput = {
    ...(query.status !== 'all' ? { published: query.status === 'published' } : {}),
    ...(query.q ? { OR: ['title', 'excerpt', 'content'].map(field => ({ [field]: { contains: query.q, mode: 'insensitive' } })) } : {}),
  }
  const [rows, drafts, published] = await Promise.all([
    prisma.blogPost.findMany({ where, select: summaryFields, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}) }),
    prisma.blogPost.count({ where: { published: false } }),
    prisma.blogPost.count({ where: { published: true } }),
  ])
  const hasMore = rows.length > query.limit
  if (hasMore) rows.pop()
  return { data: rows.map(summary), counts: { draft: drafts, published }, nextCursor: hasMore ? rows.at(-1)?.id || null : null }
}

/** Every new record starts unpublished, regardless of the legacy model default. */
export async function createBlogDraft(actorId: string, input: z.infer<typeof createBlogSchema>) {
  try {
    return await prisma.$transaction(async tx => {
      // Protect ID-or-slug legacy reads from ambiguous newly created permalinks.
      const existing = await tx.blogPost.findFirst({ where: { OR: [{ slug: { equals: input.slug, mode: 'insensitive' } }, { id: input.slug }] }, select: { id: true } })
      if (existing) throw new BlogAdminError('This URL slug is already in use. Choose another.', 409, 'SLUG_UNAVAILABLE')
      const row = await tx.blogPost.create({ data: { ...input, excerpt: input.excerpt || null, imageUrl: input.imageUrl || null, published: false } })
      await indexArticle(tx, row.id)
      await tx.activityLog.create({ data: { userId: actorId, action: 'blog_draft_created', entityType: 'blog_post', entityId: row.id, metadata: { slug: row.slug } } })
      return { data: article(row) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new BlogAdminError('This URL slug is already in use. Choose another.', 409, 'SLUG_UNAVAILABLE')
    throw error
  }
}

/** Saved content, publication status, and the audit record form one versioned decision. */
export async function updateBlogArticle(actorId: string, input: z.infer<typeof updateBlogSchema>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "BlogPost" WHERE "id" = ${input.id} FOR UPDATE`
    const current = await tx.blogPost.findUnique({ where: { id: input.id } })
    if (!current) throw new BlogAdminError('Article not found', 404)
    const saved = article(current)
    if (input.version !== saved.version) throw new BlogAdminError('Another admin changed this article. Your text is still here; reload the saved version before trying again.', 409, 'ARTICLE_CHANGED')
    const changes = {
      ...input.changes,
      ...(input.changes.excerpt !== undefined ? { excerpt: input.changes.excerpt || null } : {}),
      ...(input.changes.imageUrl !== undefined ? { imageUrl: input.changes.imageUrl || null } : {}),
    }
    const next = { ...current, ...changes }
    if (next.published && !next.content.trim()) throw new BlogAdminError('Add article content before publishing.', 400, 'CONTENT_REQUIRED')
    const changedFields = Object.entries(changes).filter(([key, value]) => current[key as keyof BlogPost] !== value).map(([key]) => key)
    if (!changedFields.length) {
      await indexArticle(tx, current.id)
      return { data: saved, idempotent: true }
    }
    const updated = await tx.blogPost.update({ where: { id: input.id }, data: changes })
    await indexArticle(tx, updated.id)
    const action = current.published !== updated.published ? updated.published ? 'blog_article_published' : 'blog_article_unpublished' : 'blog_article_updated'
    await tx.activityLog.create({ data: { userId: actorId, action, entityType: 'blog_post', entityId: updated.id, metadata: { changedFields, published: updated.published } } })
    return { data: article(updated), idempotent: false }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
