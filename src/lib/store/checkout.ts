import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { PaymentResourceError } from '@/lib/payments/resource'
import { staffShippingAddressSchema } from './order-shipping'

export const storeCheckoutSchema = z.object({
  checkoutKey: z.string().uuid().optional(),
  items: z.array(z.object({ productId: z.string().min(1), quantity: z.number().int().min(1).max(99) })).min(1).max(50),
  shippingAddress: staffShippingAddressSchema.optional(),
  source: z.string().optional(), chakra: z.string().optional(), intention: z.string().optional(), experimentVariant: z.string().optional(),
})
type Checkout = z.infer<typeof storeCheckoutSchema>

function cartLines(items: Checkout['items']) {
  const quantities = new Map<string, number>()
  for (const item of items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity)
  const lines = [...quantities].sort(([a], [b]) => a.localeCompare(b)).map(([productId, quantity]) => ({ productId, quantity }))
  if (lines.some(item => item.quantity > 99)) throw new PaymentResourceError('Product quantity must not exceed 99', 400)
  return lines
}

function addressIdentity(value: unknown) {
  const parsed = staffShippingAddressSchema.safeParse(value)
  if (!parsed.success) return null
  const address = parsed.data
  return JSON.stringify([address.name, address.line1, address.line2 || '', address.city, address.state, address.postalCode, address.phone || ''])
}

/** Save one owned immutable cart per retry key, before making any gateway request. */
export async function prepareStoreOrder(userId: string, input: Checkout) {
  const items = cartLines(input.items)
  return prisma.$transaction(async tx => {
    // Account closure takes the same lock before reviewing pending purchases.
    await lockTransaction(tx, 'account', userId)
    const [user] = await tx.$queryRaw<Array<{ closedAt: Date | null }>>`SELECT "closedAt" FROM "User" WHERE "id" = ${userId} FOR SHARE`
    if (!user || user.closedAt) throw new PaymentResourceError('Unauthorized', 401)
    if (input.checkoutKey) {
      const saved = await tx.order.findUnique({ where: { userId_checkoutKey: { userId, checkoutKey: input.checkoutKey } }, include: { items: true } })
      if (saved) {
        if (JSON.stringify(cartLines(saved.items)) !== JSON.stringify(items) || addressIdentity(saved.shippingAddress) !== addressIdentity(input.shippingAddress)) {
          throw new PaymentResourceError('Checkout details changed; start a new checkout', 409)
        }
        return { order: saved, resumed: true }
      }
    }
    const products = await tx.product.findMany({
      where: { id: { in: items.map(item => item.productId) }, isActive: true },
      select: { id: true, title: true, pricePaise: true, stockStatus: true, stockCount: true },
    })
    const productMap = new Map(products.map(product => [product.id, product]))
    const lines = items.map(item => {
      const product = productMap.get(item.productId)
      if (!product) throw new PaymentResourceError(`Product not found: ${item.productId}`, 404)
      if (product.stockStatus === 'OUT' || product.stockCount != null && product.stockCount < item.quantity) {
        throw new PaymentResourceError(`Product out of stock: ${product.title}`, 400)
      }
      if (product.pricePaise <= 0) throw new PaymentResourceError('Order total must be positive', 400)
      return { ...item, pricePaise: product.pricePaise * item.quantity }
    })
    const totalPaise = lines.reduce((sum, item) => sum + item.pricePaise, 0)
    if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0 || totalPaise > 2147483647) throw new PaymentResourceError('Order total is outside the supported range', 400)
    const order = await tx.order.create({ data: {
      userId, checkoutKey: input.checkoutKey, status: 'pending_payment', totalPaise,
      shippingAddress: input.shippingAddress, source: input.source || null, chakra: input.chakra || null,
      intention: input.intention || null, experimentVariant: input.experimentVariant || null,
      items: { create: lines },
    } })
    return { order, resumed: false }
  }, { maxWait: 10000, timeout: 10000 })
}
