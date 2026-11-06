import { z } from 'zod'

const id = z.string().min(1).max(150)
const audioUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !/[\u0000-\u0020]/.test(value) } catch { return false }
}, 'Use an HTTPS audio URL without embedded credentials, or leave it empty while drafting')
export const audioFieldsSchema = z.object({
  title: z.string().trim().min(1, 'A title is required').max(200),
  description: z.string().trim().max(20000), category: z.string().trim().min(1, 'A category is required').max(80),
  audioUrl, duration: z.number().int().min(1).max(86400), isPremium: z.boolean(),
}).strict()
export const createAudioSchema = audioFieldsSchema.extend({ slug: z.string().trim().toLowerCase().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens for the URL slug') }).strict()
export const audioVersionSchema = z.object({ id, version: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
export const changeAudioSchema = audioVersionSchema.extend({ change: z.discriminatedUnion('action', [
  z.object({ action: z.literal('details'), fields: audioFieldsSchema }).strict(),
  z.object({ action: z.literal('publish') }).strict(), z.object({ action: z.literal('withdraw') }).strict(),
]) }).strict()
export const audioQuerySchema = z.object({ id: id.optional(), q: z.string().trim().max(200).default(''), status: z.enum(['all', 'draft', 'published']).default('all'), limit: z.coerce.number().int().min(1).max(100).default(25), cursor: id.optional() }).strict()
export const audioDetailSchema = z.object({ id, slug: z.string(), title: z.string(), description: z.string().nullable(), category: z.string(), audioUrl: z.string(), duration: z.number().int(), isPremium: z.boolean(), isPublished: z.boolean(), createdAt: z.string(), version: z.string().regex(/^[a-f0-9]{64}$/) })
export const audioSummarySchema = audioDetailSchema.omit({ description: true, audioUrl: true, version: true })
export type AudioSummary = z.infer<typeof audioSummarySchema>
export type AudioDetail = z.infer<typeof audioDetailSchema>
export type AudioFields = z.infer<typeof audioFieldsSchema>
export type AudioChange = z.infer<typeof changeAudioSchema>['change']
