import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { courseAdminQuerySchema, courseFieldsSchema, createCourseSchema, lessonFieldsSchema, updateCourseSchema, type CourseDetail } from './admin-schema'

export class CourseAdminError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = 'CourseAdminError' }
}
const include = { lessons: { orderBy: [{ order: 'asc' }, { id: 'asc' }] }, _count: { select: { enrollments: true, lessons: true } } } satisfies Prisma.CourseInclude
type CourseRow = Prisma.CourseGetPayload<{ include: typeof include }>
function summary(row: Omit<CourseRow, 'lessons'>) {
  return { id: row.id, slug: row.slug, title: row.title, pricePaise: row.pricePaise, imageUrl: row.imageUrl,
    isActive: row.isActive, updatedAt: row.updatedAt.toISOString(), lessonCount: row._count.lessons, enrollmentCount: row._count.enrollments }
}
function detail(row: CourseRow): CourseDetail {
  const data = { ...summary(row), description: row.description,
    lessons: row.lessons.map(({ id, title, content, videoUrl, order }) => ({ id, title, content, videoUrl, order })) }
  // Enrollment counts are informational; curriculum protection always checks fresh rows under the catalog lock.
  const versioned = { ...data, enrollmentCount: undefined }
  return { ...data, version: createHash('sha256').update(JSON.stringify(versioned)).digest('hex') }
}
async function currentAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } })
  if (actor?.role !== 'ADMIN') throw new CourseAdminError('Forbidden: admin only', 403)
}
async function indexCourse(tx: Prisma.TransactionClient, id: string) {
  const vector = Prisma.sql`to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", ''))`
  await tx.$executeRaw(Prisma.sql`UPDATE "Course" SET "searchVector" = ${vector} WHERE "id" = ${id} AND "searchVector" IS DISTINCT FROM ${vector}`)
}

/** Private metadata lists are bounded; lesson text and media are loaded only for an opened editor. */
export async function listManagedCourses(query: z.infer<typeof courseAdminQuerySchema>) {
  if (query.id) {
    const row = await prisma.course.findUnique({ where: { id: query.id }, include })
    if (!row) throw new CourseAdminError('Course not found', 404)
    return { data: detail(row) }
  }
  const where: Prisma.CourseWhereInput = {
    ...(query.status !== 'all' ? { isActive: query.status === 'published' } : {}),
    ...(query.q ? { OR: ['title', 'slug', 'description'].map(field => ({ [field]: { contains: query.q, mode: 'insensitive' } })) } : {}),
  }
  const rows = await prisma.course.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1, ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    include: { _count: { select: { enrollments: true, lessons: true } } } })
  const more = rows.length > query.limit
  if (more) rows.pop()
  return { data: rows.map(summary), nextCursor: more ? rows.at(-1)?.id ?? null : null }
}

/** New courses are drafts; creating a listing never silently publishes an empty curriculum. */
export async function createManagedCourse(actorId: string, input: z.infer<typeof createCourseSchema>) {
  try {
    return await prisma.$transaction(async tx => {
      await lockTransaction(tx, 'course', `slug:${input.slug}`)
      await currentAdmin(tx, actorId)
      const existing = await tx.course.findFirst({ where: { OR: [{ slug: { equals: input.slug, mode: 'insensitive' } }, { id: input.slug }] }, select: { id: true } })
      if (existing) throw new CourseAdminError('This URL slug is already in use. Choose another.', 409, 'SLUG_UNAVAILABLE')
      const row = await tx.course.create({ data: { ...input, imageUrl: input.imageUrl || null, isActive: false }, include })
      await indexCourse(tx, row.id)
      await tx.activityLog.create({ data: { userId: actorId, action: 'course_draft_created', entityType: 'course', entityId: row.id, metadata: { slug: row.slug } } })
      return { data: detail(row) }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new CourseAdminError('This URL slug is already in use. Choose another.', 409, 'SLUG_UNAVAILABLE')
    throw error
  }
}

/** Catalog edits share enrollment's lock, preserving saved purchases and progress order. */
export async function changeManagedCourse(actorId: string, input: z.infer<typeof updateCourseSchema>, remove = false) {
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'course', `catalog:${input.id}`)
    await currentAdmin(tx, actorId)
    const current = await tx.course.findUnique({ where: { id: input.id }, include })
    if (!current) throw new CourseAdminError('Course not found', 404)
    if (detail(current).version !== input.version) throw new CourseAdminError('Another admin changed this course. Your draft is preserved; reload the saved version before trying again.', 409, 'COURSE_CHANGED')
    const action = remove ? 'delete' : input.change.action
    const structural = ['delete', 'add_lesson', 'delete_lesson', 'reorder_lessons'].includes(action)
    if (structural && (current._count.enrollments > 0 || await tx.payment.count({ where: { type: 'COURSE', metadata: { path: ['courseId'], equals: current.id } } }) > 0)) {
      throw new CourseAdminError('This course has enrollment or payment records. Keep its lessons and order; archive it to stop new enrollments.', 409, 'PURCHASES_PROTECTED')
    }
    if (remove) {
      if (current.isActive) throw new CourseAdminError('Archive the course before deleting its draft.', 409)
      await tx.course.delete({ where: { id: current.id } })
      await tx.activityLog.create({ data: { userId: actorId, action: 'course_draft_deleted', entityType: 'course', entityId: current.id } })
      return { data: { id: current.id, deleted: true as const } }
    }
    const change = input.change
    if (change.action === 'details') {
      await tx.course.update({ where: { id: current.id }, data: { ...change.fields, imageUrl: change.fields.imageUrl || null } })
    } else if (change.action === 'publish') {
      if (!courseFieldsSchema.safeParse({ title: current.title, description: current.description, pricePaise: current.pricePaise, imageUrl: current.imageUrl ?? '' }).success) throw new CourseAdminError('Save valid course details before publishing.', 400)
      if (!current.lessons.length || current.lessons.some(lesson => !lessonFieldsSchema.safeParse({ title: lesson.title, content: lesson.content ?? '', videoUrl: lesson.videoUrl ?? '' }).success)
        || new Set(current.lessons.map(lesson => lesson.order)).size !== current.lessons.length || current.lessons.some(lesson => lesson.order < 0 || lesson.order >= 2147483647)) {
        throw new CourseAdminError('Add at least one complete lesson with a valid, unique lesson order before publishing.', 400, 'CURRICULUM_REQUIRED')
      }
      await tx.course.update({ where: { id: current.id }, data: { isActive: true } })
    } else if (change.action === 'archive') {
      await tx.course.update({ where: { id: current.id }, data: { isActive: false } })
    } else if (change.action === 'add_lesson') {
      if (current.lessons.length >= 200) throw new CourseAdminError('A course can have at most 200 lessons.', 400)
      const order = current.lessons.length ? Math.max(...current.lessons.map(lesson => lesson.order)) + 1 : 0
      if (order < 0 || order >= 2147483647) throw new CourseAdminError('Reorder this curriculum before adding another lesson.', 409)
      await tx.courseLesson.create({ data: { courseId: current.id, ...change.fields, videoUrl: change.fields.videoUrl || null, content: change.fields.content || null, order } })
    } else if (change.action === 'edit_lesson' || change.action === 'delete_lesson') {
      if (!current.lessons.some(lesson => lesson.id === change.lessonId)) throw new CourseAdminError('Lesson not found in this course', 404)
      if (change.action === 'delete_lesson') {
        if (current.isActive && current.lessons.length === 1) throw new CourseAdminError('Archive the course before removing its last lesson.', 409)
        await tx.courseLesson.delete({ where: { id: change.lessonId } })
      } else await tx.courseLesson.update({ where: { id: change.lessonId }, data: { ...change.fields, videoUrl: change.fields.videoUrl || null, content: change.fields.content || null } })
    } else if (change.action === 'reorder_lessons') {
      if (change.lessonIds.length !== current.lessons.length || new Set(change.lessonIds).size !== current.lessons.length || change.lessonIds.some(id => !current.lessons.some(lesson => lesson.id === id))) throw new CourseAdminError('Reorder every existing lesson exactly once.', 400)
      for (const [order, id] of change.lessonIds.entries()) await tx.courseLesson.update({ where: { id }, data: { order } })
    }
    if (!['details', 'publish', 'archive'].includes(change.action)) await tx.course.update({ where: { id: current.id }, data: { updatedAt: new Date() } })
    await indexCourse(tx, current.id)
    await tx.activityLog.create({ data: { userId: actorId, action: `course_${action}`, entityType: 'course', entityId: current.id, metadata: { action, ...('lessonId' in change ? { lessonId: change.lessonId } : {}) } } })
    const row = await tx.course.findUniqueOrThrow({ where: { id: current.id }, include })
    return { data: detail(row) }
  }, { timeout: 10000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
}
