import { z } from 'zod'

export const maxServicePrice = 21_474_836.47
export const maxServiceDuration = 1440

const requiredText = z.string().trim().min(1)
const numeric = z.union([z.number(), z.string().trim().regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i)])
  .transform(Number)
const price = numeric
  .pipe(z.number().min(0).max(maxServicePrice))
  .refine(value => Math.round(value * 100) / 100 === value)
const duration = numeric
  .pipe(z.number().int().min(1).max(maxServiceDuration))
const mode = z.enum(['ONLINE', 'OFFLINE', 'BOTH'])
const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)

export const serviceFieldsSchema = z.object({
  name: requiredText,
  description: requiredText,
  category: requiredText,
  price,
  duration,
  mode,
})

export const serviceFormSchema = serviceFieldsSchema.extend({ slug })

const serviceCatalogSchema = serviceFieldsSchema.extend({
  slug,
  tagline: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  benefits: z.array(z.string()).optional(),
})

export const createServiceSchema = serviceCatalogSchema.omit({ slug: true })
  .extend({ mode: mode.default('BOTH') })
  .transform(data => ({
    ...data,
    slug: data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    benefits: data.benefits?.length ? data.benefits : undefined,
  }))
  .refine(data => slug.safeParse(data.slug).success)

export const updateServiceSchema = serviceCatalogSchema.extend({
  isActive: z.boolean(),
  popularity: z.number().int().min(0).max(2_147_483_647),
}).partial().strict()
