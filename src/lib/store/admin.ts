import { Prisma, type Product } from '@prisma/client'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export class ProductAdminError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: string) { super(message); this.name = 'ProductAdminError' }
}
export const deleteProductSchema = z.object({ id: z.string().min(1).max(200), version: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const deletionFields = ['id', 'slug', 'title', 'shortDescription', 'longDescription', 'pricePaise', 'imageUrl', 'gallery', 'ratingAvg', 'stockStatus', 'stockCount', 'chakra', 'spiritualBenefits', 'ritualUse', 'consecrationStory', 'isConsecrated', 'categoryId', 'serviceId', 'isActive', 'createdAt', 'updatedAt'] as const satisfies readonly (keyof Product)[]

/** Cover content too: same-millisecond edits must invalidate an open deletion confirmation. */
export function productDeleteVersion(product: Product) {
  return createHash('sha256').update(JSON.stringify(deletionFields.map(key => product[key]))).digest('hex')
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
