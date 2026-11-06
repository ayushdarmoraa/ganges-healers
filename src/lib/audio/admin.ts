import { createHash } from 'node:crypto'
import { Prisma, type AudioTrack } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { audioFieldsSchema, audioQuerySchema, changeAudioSchema, createAudioSchema, type AudioDetail } from './admin-schema'
import type { z } from 'zod'

export class AudioAdminError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) { super(message); this.name = 'AudioAdminError' }
}
/** Include content in the review version so edits do not depend on a timestamp's precision. */
export function audioAdminDetail(row: AudioTrack): AudioDetail {
  const data = { id: row.id, slug: row.slug, title: row.title, description: row.description, category: row.category, audioUrl: row.audioUrl, duration: row.duration, isPremium: row.isPremium, isPublished: row.isPublished, createdAt: row.createdAt.toISOString() }
  return { ...data, version: createHash('sha256').update(JSON.stringify(data)).digest('hex') }
}
async function currentAdmin(tx: Prisma.TransactionClient, actorId: string) {
  if ((await tx.user.findUnique({ where: { id: actorId }, select: { role: true } }))?.role !== 'ADMIN') throw new AudioAdminError('Administrator access is required.', 403, 'FORBIDDEN')
}
async function indexAudio(tx: Prisma.TransactionClient, id: string) {
  // Keep publication/search consistent even in development databases without SQL triggers.
  const vector = Prisma.sql`to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '') || ' ' || coalesce("category", ''))`
  await tx.$executeRaw(Prisma.sql`UPDATE "AudioTrack" SET "searchVector" = ${vector} WHERE "id" = ${id} AND "searchVector" IS DISTINCT FROM ${vector}`)
}
/** Bounded administration reads never cache media URLs or draft metadata. */
export async function listManagedAudio(raw: z.infer<typeof audioQuerySchema>) {
  const query = audioQuerySchema.parse(raw)
  if (query.id) {
    const row = await prisma.audioTrack.findUnique({ where: { id: query.id } })
    if (!row) throw new AudioAdminError('Audio track not found', 404, 'TRACK_NOT_FOUND')
    return { data: audioAdminDetail(row) }
  }
  const where: Prisma.AudioTrackWhereInput = { ...(query.status === 'all' ? {} : { isPublished: query.status === 'published' }), ...(query.q ? { OR: ['title', 'slug', 'description', 'category'].map(field => ({ [field]: { contains: query.q, mode: 'insensitive' } })) } : {}) }
  const rows = await prisma.audioTrack.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}), select: { id: true, slug: true, title: true, category: true, duration: true, isPremium: true, isPublished: true, createdAt: true } })
  const more = rows.length > query.limit; if (more) rows.pop()
  return { data: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), nextCursor: more ? rows.at(-1)?.id ?? null : null }
}
/** Draft creation preserves slug uniqueness across both id- and slug-addressed public routes. */
export async function createManagedAudio(actorId: string, raw: z.infer<typeof createAudioSchema>) {
  const input = createAudioSchema.parse(raw)
  try {
    return await prisma.$transaction(async tx => {
      await lockTransaction(tx, 'audio', `slug:${input.slug}`); await currentAdmin(tx, actorId)
      if (await tx.audioTrack.findFirst({ where: { OR: [{ slug: { equals: input.slug, mode: 'insensitive' } }, { id: input.slug }] }, select: { id: true } })) throw new AudioAdminError('This URL slug is already in use. Choose another.', 409, 'SLUG_UNAVAILABLE')
      const row = await tx.audioTrack.create({ data: { ...input, description: input.description || null, isPublished: false } })
      await indexAudio(tx, row.id)
      await tx.activityLog.create({ data: { userId: actorId, action: 'audio_draft_created', entityType: 'audio', entityId: row.id, metadata: { slug: row.slug } } })
      return { data: audioAdminDetail(row) }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AudioAdminError('This URL slug is already in use. Choose another.', 409, 'SLUG_UNAVAILABLE')
    throw error
  }
}
/** Versions, current roles and publication are checked under the catalog's transaction lock. */
export async function changeManagedAudio(actorId: string, raw: z.infer<typeof changeAudioSchema>) {
  const input = changeAudioSchema.parse(raw)
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'audio', `catalog:${input.id}`); await currentAdmin(tx, actorId)
    const row = await tx.audioTrack.findUnique({ where: { id: input.id } })
    if (!row) throw new AudioAdminError('Audio track not found', 404, 'TRACK_NOT_FOUND')
    if (audioAdminDetail(row).version !== input.version) throw new AudioAdminError('Another administrator changed this track. Your draft is preserved; reload the saved version before trying again.', 409, 'AUDIO_CHANGED')
    const change = input.change
    if (change.action === 'publish' || change.action === 'details' && row.isPublished) {
      const fields = change.action === 'details' ? change.fields : { ...row, description: row.description || '' }
      const valid = audioFieldsSchema.safeParse({ title: fields.title, description: fields.description, category: fields.category, audioUrl: fields.audioUrl, duration: fields.duration, isPremium: fields.isPremium })
      if (!valid.success || !valid.data.audioUrl) throw new AudioAdminError('Save valid track details and an HTTPS audio URL before publishing.', 400, 'INVALID_PUBLICATION')
    }
    const updated = await tx.audioTrack.update({ where: { id: row.id }, data: change.action === 'details' ? { ...change.fields, description: change.fields.description || null } : { isPublished: change.action === 'publish' } })
    await indexAudio(tx, row.id)
    await tx.activityLog.create({ data: { userId: actorId, action: change.action === 'details' ? 'audio_updated' : change.action === 'publish' ? 'audio_published' : 'audio_withdrawn', entityType: 'audio', entityId: row.id, metadata: { slug: row.slug, isPublished: updated.isPublished, isPremium: updated.isPremium } } })
    return { data: audioAdminDetail(updated) }
  })
}
