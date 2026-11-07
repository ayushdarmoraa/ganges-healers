import { Prisma, type Product } from '@prisma/client'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { productImageFields } from '@/config/images'

export class ProductAdminError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); this.name = 'ProductAdminError' }
}
export const deleteProductSchema = z.object({ id: z.string().min(1).max(200), version: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const deletionFields = ['id', 'slug', 'title', 'shortDescription', 'longDescription', 'pricePaise', 'imageUrl', 'gallery', 'ratingAvg', 'stockStatus', 'stockCount', 'chakra', 'spiritualBenefits', 'ritualUse', 'consecrationStory', 'isConsecrated', 'categoryId', 'serviceId', 'isActive', 'createdAt', 'updatedAt'] as const satisfies readonly (keyof Product)[]

/** Cover content too: same-millisecond edits must invalidate an open deletion confirmation. */
export function productDeleteVersion(product: Product) {
  return createHash('sha256').update(JSON.stringify(deletionFields.map(key => product[key]))).digest('hex')
}

const wholeNumber = z.string().trim().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(2147483647))
const productFields = z.object({
  title: z.string().trim().min(1).max(200),
  shortDescription: z.string().max(2000).default(''),
  longDescription: z.string().max(20000).default(''),
  pricePaise: wholeNumber,
  imageUrl: z.string().max(2000).default(''),
  stockStatus: z.enum(['IN_STOCK', 'LOW', 'OUT']),
  stockCount: z.string().trim().refine(value => !value || /^\d+$/.test(value)).transform(value => value ? Number(value) : null).pipe(z.number().int().min(0).max(2147483647).nullable()).default(null),
})

function fieldsFromForm(form: FormData) {
  const parsed = productFields.safeParse(Object.fromEntries(form))
  if (!parsed.success) throw new ProductAdminError('Enter a title, whole-number price and valid stock quantity/status. Check the field limits.', 400, 'INVALID_PRODUCT_FIELDS')
  const fields = parsed.data
  const stockStatus = fields.stockCount === null ? fields.stockStatus : fields.stockCount === 0 || fields.stockStatus === 'OUT' ? 'OUT' : fields.stockCount <= 5 ? 'LOW' : 'IN_STOCK'
  return { ...fields, stockStatus }
}

async function assertProductAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const [actor] = await tx.$queryRaw<Array<{ role: string; closedAt: Date | null }>>`SELECT "role", "closedAt" FROM "User" WHERE "id" = ${actorId} FOR SHARE`
  if (actor?.role !== 'ADMIN' || actor.closedAt) throw new ProductAdminError('Administrator access is required.', 403, 'FORBIDDEN')
}

function reviewedProduct(form: FormData) {
  const parsed = deleteProductSchema.safeParse({ id: form.get('id'), version: form.get('version') })
  if (!parsed.success) throw new ProductAdminError('Reload and review this product before saving.', 400, 'INVALID_PRODUCT_VERSION')
  return parsed.data
}

async function lockReviewedProduct(tx: Prisma.TransactionClient, actorId: string, input: z.infer<typeof deleteProductSchema>) {
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${input.id} FOR UPDATE`
  await assertProductAdmin(tx, actorId)
  const product = await tx.product.findUnique({ where: { id: input.id } })
  if (!product) throw new ProductAdminError('This product no longer exists. Reload the product list.', 404, 'PRODUCT_NOT_FOUND')
  if (productDeleteVersion(product) !== input.version) throw new ProductAdminError('This product or its stock changed. Reload and review the latest values before saving.', 409, 'PRODUCT_CHANGED')
  return product
}

function images(primary: string, gallery: unknown) {
  try { return productImageFields(primary, gallery) } catch {
    throw new ProductAdminError('Choose supported HTTPS product photos, with no more than eight gallery images.', 400, 'INVALID_PRODUCT_IMAGE')
  }
}

/** Validate a new catalog entry and commit it with the current actor and audit. */
export async function createCatalogProduct(actorId: string, form: FormData) {
  const fields = fieldsFromForm(form)
  const slug = z.string().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).safeParse(form.get('slug'))
  if (!slug.success) throw new ProductAdminError('Use lowercase letters, numbers and single hyphens for the URL slug.', 400, 'INVALID_PRODUCT_SLUG')
  let gallery: unknown
  try { gallery = JSON.parse(String(form.get('gallery') || '[]')) } catch {
    throw new ProductAdminError('The gallery could not be read. Review your photos and try again.', 400, 'INVALID_PRODUCT_IMAGE')
  }
  const photos = images(fields.imageUrl, gallery)
  const text = (key: string) => {
    const value = form.get(key) ?? ''
    const parsed = z.string().max(20000).safeParse(value)
    if (!parsed.success) throw new ProductAdminError('Product text is too long. Use no more than 20,000 characters per field.', 400, 'INVALID_PRODUCT_FIELDS')
    return parsed.data
  }
  const spiritualBenefits = text('spiritualBenefits').split('\n').map(value => value.trim()).filter(Boolean)
  const ritualUse = text('ritualUse').split('\n').map(value => value.trim()).filter(Boolean)
  const chakra = text('chakra').trim() || null, consecrationStory = text('consecrationStory') || null
  try {
    return await prisma.$transaction(async tx => {
      await assertProductAdmin(tx, actorId)
      const product = await tx.product.create({ data: { ...fields, imageUrl: photos.imageUrl, gallery: photos.gallery.length ? photos.gallery : undefined,
        slug: slug.data, chakra, consecrationStory, isConsecrated: form.get('isConsecrated') === 'true', spiritualBenefits, ritualUse } })
      await tx.activityLog.create({ data: { userId: actorId, action: 'product_created', entityType: 'product', entityId: product.id, metadata: { stockCount: product.stockCount, stockStatus: product.stockStatus } } })
      return product
    }, { maxWait: 10000, timeout: 10000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ProductAdminError('That URL slug is already in use. Choose another.', 409, 'PRODUCT_SLUG_IN_USE')
    throw error
  }
}

/** Reject stale catalog/stock drafts, then save only editable fields and audit atomically. */
export async function updateCatalogProduct(actorId: string, form: FormData) {
  const input = reviewedProduct(form), fields = fieldsFromForm(form)
  return prisma.$transaction(async tx => {
    const product = await lockReviewedProduct(tx, actorId, input)
    const imageUrl = fields.imageUrl === (product.imageUrl ?? '') ? product.imageUrl : images(fields.imageUrl, []).imageUrl
    const saved = await tx.product.update({ where: { id: product.id }, data: { ...fields, imageUrl } })
    await tx.activityLog.create({ data: { userId: actorId, action: 'product_updated', entityType: 'product', entityId: product.id,
      metadata: { stockBefore: product.stockCount, stockAfter: saved.stockCount, statusBefore: product.stockStatus, statusAfter: saved.stockStatus } } })
    return saved
  }, { maxWait: 10000, timeout: 10000 })
}

/** Toggle only the reviewed current product; purchase and inventory records remain intact. */
export async function toggleCatalogProduct(actorId: string, form: FormData) {
  const input = reviewedProduct(form)
  return prisma.$transaction(async tx => {
    const product = await lockReviewedProduct(tx, actorId, input)
    const saved = await tx.product.update({ where: { id: product.id }, data: { isActive: !product.isActive } })
    await tx.activityLog.create({ data: { userId: actorId, action: saved.isActive ? 'product_activated' : 'product_deactivated', entityType: 'product', entityId: product.id, metadata: { from: product.isActive, to: saved.isActive } } })
    return saved
  }, { maxWait: 10000, timeout: 10000 })
}

/** Delete only an unchanged, unreferenced product. The row lock also serializes FK inserts. */
export async function deleteUnreferencedProduct(actorId: string, input: z.infer<typeof deleteProductSchema>) {
  return prisma.$transaction(async tx => {
    // FOR UPDATE conflicts with the key-share lock taken by order/bundle FK inserts.
    // A committed purchase must be visible before we decide whether deletion is safe.
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${input.id} FOR UPDATE`
    const actor = await tx.user.findUnique({ where: { id: actorId }, select: { role: true } })
    if (actor?.role !== 'ADMIN') throw new ProductAdminError('Administrator access is required.', 403, 'FORBIDDEN')
    const product = await tx.product.findUnique({ where: { id: input.id } })
    if (!product) throw new ProductAdminError('This product no longer exists. Reload the product list.', 404, 'PRODUCT_NOT_FOUND')
    if (productDeleteVersion(product) !== input.version) throw new ProductAdminError('Another administrator changed this product. Reload and review it before deleting.', 409, 'PRODUCT_CHANGED')
    const orderItem = await tx.orderItem.findFirst({ where: { productId: product.id }, select: { id: true } })
    const bundleItem = await tx.bundleItem.findFirst({ where: { productId: product.id }, select: { id: true } })
    if (orderItem || bundleItem) throw new ProductAdminError('This product has order or bundle records. Deactivate it to remove it from sale while keeping its history.', 409, 'PRODUCT_IN_USE')
    await tx.product.delete({ where: { id: product.id } })
    await tx.activityLog.create({ data: { userId: actorId, action: 'product_deleted', entityType: 'product', entityId: product.id, metadata: { orderRecords: false, bundleRecords: false } } })
    return { id: product.id, slug: product.slug }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 10000 })
}
