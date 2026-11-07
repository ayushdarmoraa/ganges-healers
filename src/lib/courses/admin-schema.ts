import { z } from 'zod'
import { isAllowedArticleImage } from '@/config/images'

const id = z.string().min(1).max(150)
const title = z.string().trim().min(1, 'A title is required').max(200)
const description = z.string().trim().min(1, 'A description is required').max(20000)
const imageUrl = z.string().trim().max(2000).refine(isAllowedArticleImage, 'Use an HTTPS image from the configured image hosts, or leave this empty')
const pricePaise = z.number().int().min(0).max(2147483647)
const videoUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !/[\u0000-\u0020]/.test(value) } catch { return false }
}, 'Use an HTTPS video or embed URL without embedded credentials')

export const courseFieldsSchema = z.object({ title, description, pricePaise, imageUrl }).strict()
export const createCourseSchema = courseFieldsSchema.extend({
  slug: z.string().trim().toLowerCase().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letters, numbers, and single hyphens for the URL slug'),
}).strict()
export const lessonFieldsSchema = z.object({ title, videoUrl, content: z.string().max(50000) }).strict()
  .refine(value => !!(value.content.trim() || value.videoUrl), 'Add lesson text or a video URL before saving')

export const courseChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('details'), fields: courseFieldsSchema }).strict(),
  z.object({ action: z.literal('publish') }).strict(),
  z.object({ action: z.literal('archive') }).strict(),
  z.object({ action: z.literal('add_lesson'), fields: lessonFieldsSchema }).strict(),
  z.object({ action: z.literal('edit_lesson'), lessonId: id, fields: lessonFieldsSchema }).strict(),
  z.object({ action: z.literal('delete_lesson'), lessonId: id }).strict(),
  z.object({ action: z.literal('reorder_lessons'), lessonIds: z.array(id).min(1).max(200) }).strict(),
])
export const courseVersionSchema = z.object({ id, version: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const updateCourseSchema = courseVersionSchema.extend({ change: courseChangeSchema }).strict()
export const courseAdminQuerySchema = z.object({
  id: id.optional(), q: z.string().trim().max(200).default(''),
  status: z.enum(['all', 'draft', 'published']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(25), cursor: id.optional(),
}).strict()

export const courseSummarySchema = z.object({
  id, slug: z.string(), title: z.string(), pricePaise: z.number().int(), imageUrl: z.string().nullable(),
  isActive: z.boolean(), updatedAt: z.string(), lessonCount: z.number().int().nonnegative(), enrollmentCount: z.number().int().nonnegative(),
})
export const courseDetailSchema = courseSummarySchema.extend({
  description: z.string(), version: z.string().regex(/^[a-f0-9]{64}$/),
  lessons: z.array(z.object({ id, title: z.string(), content: z.string().nullable(), videoUrl: z.string().nullable(), order: z.number().int() })),
})
export type CourseSummary = z.infer<typeof courseSummarySchema>
export type CourseDetail = z.infer<typeof courseDetailSchema>
export type CourseChange = z.infer<typeof courseChangeSchema>
