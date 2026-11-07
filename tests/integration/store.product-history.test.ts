import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { deleteUnreferencedProduct, productDeleteVersion, createCatalogProduct, updateCatalogProduct, toggleCatalogProduct } from '@/lib/store/admin'

const users: string[] = [], products: string[] = [], bundles: string[] = [], payments: string[] = []
let productId = ''
const version = async () => productDeleteVersion(await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
const remove = async (actor = users[0], saved?: string) => deleteUnreferencedProduct(actor, { id: productId, version: saved ?? await version() })
async function purchase(status = 'paid') {
  const order = await prisma.order.create({ data: { userId: users[1], status, totalPaise: 2500, items: { create: { productId, quantity: 2, pricePaise: 1250 } } }, include: { items: true } })
  const payment = await prisma.payment.create({ data: { userId: users[1], type: 'STORE', gateway: 'razorpay', amountPaise: 2500, status: 'success', statusEnum: 'SUCCESS', metadata: { orderId: order.id } } })
  payments.push(payment.id)
  await prisma.order.update({ where: { id: order.id }, data: { paymentId: payment.id } })
  return { orderId: order.id, paymentId: payment.id }
}
async function waitingOnProduct() {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.datname=current_database() AND NOT l.granted AND a.query LIKE ${'%FROM "Product"%FOR UPDATE%'}) AS waiting`
    if (rows[0].waiting) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return false
}
beforeAll(async () => { for (const role of ['ADMIN', 'USER'] as const) users.push((await prisma.user.create({ data: { email: `history-${randomUUID()}@example.test`, role } })).id) })
beforeEach(async () => { productId = (await prisma.product.create({ data: { slug: `history-${randomUUID()}`, title: 'History protection', pricePaise: 1250 } })).id; products.push(productId) })
afterAll(async () => {
  try {
    await prisma.activityLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.payment.deleteMany({ where: { id: { in: payments } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    await prisma.productBundle.deleteMany({ where: { id: { in: bundles } } })
    await prisma.product.deleteMany({ where: { id: { in: products } } })
  } finally { await prisma.$disconnect() }
})

test('only an unreferenced, unchanged product is removed with an atomic safe audit', async () => {
  const inputVersion = await version()
  expect(await remove(users[0], inputVersion)).toMatchObject({ id: productId })
  expect(await prisma.product.findUnique({ where: { id: productId } })).toBeNull()
  expect(await prisma.activityLog.findFirstOrThrow({ where: { entityId: productId, action: 'product_deleted' } })).toMatchObject({ userId: users[0], metadata: { orderRecords: false, bundleRecords: false } })
  await expect(remove(users[0], inputVersion)).rejects.toMatchObject({ status: 404, code: 'PRODUCT_NOT_FOUND' })
  expect(await prisma.activityLog.count({ where: { entityId: productId } })).toBe(1)
})
test('paid and pending order items, saved prices, totals and payments survive attempted deletion', async () => {
  for (const status of ['paid', 'pending_payment', 'cancelled']) {
    const { orderId, paymentId } = await purchase(status)
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } }), payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
    await expect(remove()).rejects.toMatchObject({ status: 409, code: 'PRODUCT_IN_USE' })
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } })).toEqual(order)
    expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toEqual(payment)
  }
  expect(await prisma.product.count({ where: { id: productId } })).toBe(1)
  expect(await prisma.activityLog.count({ where: { entityId: productId } })).toBe(0)
})
test('bundle composition is preserved even before any order exists', async () => {
  const bundle = await prisma.productBundle.create({ data: { slug: `history-bundle-${randomUUID()}`, title: 'Saved bundle', pricePaise: 1000, items: { create: { productId } } }, include: { items: true } }); bundles.push(bundle.id)
  await expect(remove()).rejects.toMatchObject({ code: 'PRODUCT_IN_USE' })
  expect(await prisma.productBundle.findUniqueOrThrow({ where: { id: bundle.id }, include: { items: true } })).toEqual(bundle)
})
test('a stale confirmation cannot remove a product edited by another administrator', async () => {
  const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } }), saved = productDeleteVersion(before)
  await prisma.product.update({ where: { id: productId }, data: { title: 'Updated title', updatedAt: before.updatedAt } })
  await expect(remove(users[0], saved)).rejects.toMatchObject({ code: 'PRODUCT_CHANGED' })
  expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).title).toBe('Updated title')
})
test('competing confirmations can delete only once', async () => {
  const saved = await version()
  const results = await Promise.allSettled([remove(users[0], saved), remove(users[0], saved)])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  expect(await prisma.activityLog.count({ where: { entityId: productId } })).toBe(1)
})
test('ordinary and missing actors cannot delete products', async () => {
  await expect(remove(users[1])).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await expect(remove(randomUUID())).rejects.toMatchObject({ code: 'FORBIDDEN' })
  expect(await prisma.product.count({ where: { id: productId } })).toBe(1)
})
test('a purchase holding only its actual foreign-key lock is committed before deletion checks references', async () => {
  let release!: () => void, acquired!: () => void, orderId = ''
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const saved = await version()
  const writer = prisma.$transaction(async tx => {
    const order = await tx.order.create({ data: { userId: users[1], status: 'pending_payment', totalPaise: 1250, items: { create: { productId, quantity: 1, pricePaise: 1250 } } } })
    orderId = order.id; acquired(); await unlock
  }, { timeout: 15000 })
  await locked
  const deletion = remove(users[0], saved).then(value => ({ value, error: undefined })).catch((error: unknown) => ({ value: undefined, error }))
  try { expect(await waitingOnProduct()).toBe(true) }
  finally { release(); await writer }
  expect((await deletion).error).toMatchObject({ code: 'PRODUCT_IN_USE' })
  expect(await prisma.orderItem.findMany({ where: { orderId } })).toMatchObject([{ productId, pricePaise: 1250, quantity: 1 }])
  expect(await prisma.product.count({ where: { id: productId } })).toBe(1)
})
test('administrator access revoked while waiting for the row lock is rechecked', async () => {
  let release!: () => void, acquired!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const saved = await version()
  const blocker = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`
    acquired(); await unlock
    await tx.user.update({ where: { id: users[0] }, data: { role: 'USER' } })
  }, { timeout: 15000 })
  await locked
  const deletion = remove(users[0], saved).then(value => ({ value, error: undefined })).catch((error: unknown) => ({ value: undefined, error }))
  try { expect(await waitingOnProduct()).toBe(true) }
  finally { release(); await blocker; await deletion; await prisma.user.update({ where: { id: users[0] }, data: { role: 'ADMIN' } }) }
  expect((await deletion).error).toMatchObject({ code: 'FORBIDDEN' })
  expect(await prisma.product.count({ where: { id: productId } })).toBe(1)
})

async function productForm(extra: Record<string, string> = {}) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
  const form = new FormData()
  for (const [key, value] of Object.entries({ id: product.id, version: productDeleteVersion(product), title: product.title, slug: `stock-${randomUUID()}`,
    shortDescription: product.shortDescription, longDescription: product.longDescription, imageUrl: product.imageUrl ?? '',
    pricePaise: String(product.pricePaise), stockCount: product.stockCount == null ? '' : String(product.stockCount), stockStatus: product.stockStatus, ...extra })) form.set(key, value)
  return form
}

test('product creation supports counted stock and derives status while preserving uncounted mode', async () => {
  for (const [count, manual, status] of [['0', 'IN_STOCK', 'OUT'], ['3', 'IN_STOCK', 'LOW'], ['10', 'IN_STOCK', 'IN_STOCK'], ['', 'OUT', 'OUT'], ['7', 'OUT', 'OUT']]) {
    const product = await createCatalogProduct(users[0], await productForm({ stockCount: count, stockStatus: manual }))
    products.push(product.id)
    expect(product).toMatchObject({ stockCount: count === '' ? null : Number(count), stockStatus: status })
    expect(await prisma.activityLog.count({ where: { entityId: product.id, action: 'product_created' } })).toBe(1)
  }
})

test('unrelated edits preserve a manual OUT override for positive counted stock', async () => {
  await prisma.product.update({ where: { id: productId }, data: { stockCount: 7, stockStatus: 'OUT' } })
  expect(await updateCatalogProduct(users[0], await productForm({ pricePaise: '1900' }))).toMatchObject({ stockCount: 7, stockStatus: 'OUT' })
  expect(await updateCatalogProduct(users[0], await productForm({ stockStatus: 'IN_STOCK' }))).toMatchObject({ stockCount: 7, stockStatus: 'IN_STOCK' })
})

const invalidProductFields: Array<Record<string, string>> = [{ stockCount: '-1' }, { stockCount: '1.5' }, { stockCount: '3units' }, { stockCount: '2147483648' }, { pricePaise: '12.5' }, { title: '  ' }]
test.each(invalidProductFields)('invalid catalog values are refused before writes (%j)', async invalid => {
  const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
  await expect(updateCatalogProduct(users[0], await productForm(invalid))).rejects.toMatchObject({ code: 'INVALID_PRODUCT_FIELDS' })
  await expect(createCatalogProduct(users[0], await productForm(invalid))).rejects.toMatchObject({ code: 'INVALID_PRODUCT_FIELDS' })
  expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toEqual(before)
  expect(await prisma.activityLog.count({ where: { entityId: productId } })).toBe(0)
})

test('editing and replenishing stock retain historical purchases, legacy photos and unrelated catalog fields', async () => {
  const original = await prisma.product.update({ where: { id: productId }, data: { imageUrl: 'https://legacy.example.test/photo.png', gallery: ['legacy-gallery'], chakra: 'Root', spiritualBenefits: ['Saved benefit'] } })
  const { orderId, paymentId } = await purchase()
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } }), payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })
  const saved = await updateCatalogProduct(users[0], await productForm({ stockCount: '7', pricePaise: '1900', title: 'Updated catalog title' }))
  expect(saved).toMatchObject({ stockCount: 7, stockStatus: 'IN_STOCK', pricePaise: 1900, title: 'Updated catalog title',
    slug: original.slug, imageUrl: original.imageUrl, gallery: original.gallery, chakra: original.chakra, spiritualBenefits: original.spiritualBenefits })
  expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } })).toEqual(order)
  expect(await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).toEqual(payment)
  expect(await prisma.activityLog.findFirstOrThrow({ where: { entityId: productId, action: 'product_updated' } })).toMatchObject({ metadata: { stockBefore: null, stockAfter: 7 } })
})

test('stock consumed after an editor opens invalidates its draft even with the same update timestamp', async () => {
  const before = await prisma.product.update({ where: { id: productId }, data: { stockCount: 5 } })
  const form = await productForm({ stockCount: '7' })
  await prisma.product.update({ where: { id: productId }, data: { stockCount: 4, updatedAt: before.updatedAt } })
  await expect(updateCatalogProduct(users[0], form)).rejects.toMatchObject({ code: 'PRODUCT_CHANGED' })
  expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).stockCount).toBe(4)
  expect(await prisma.activityLog.count({ where: { entityId: productId } })).toBe(0)
})

test('concurrent product drafts save only once and cannot overwrite one another', async () => {
  const first = await productForm({ stockCount: '7' }), second = await productForm({ stockCount: '9' })
  const outcomes = await Promise.allSettled([updateCatalogProduct(users[0], first), updateCatalogProduct(users[0], second)])
  expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'PRODUCT_CHANGED' } })
  expect(await prisma.activityLog.count({ where: { entityId: productId, action: 'product_updated' } })).toBe(1)
})

test('product edits recheck a role revoked while waiting on the product row', async () => {
  const form = await productForm({ stockCount: '7' })
  let acquired!: () => void, release!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const blocker = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE`
    acquired(); await unlock
    await tx.user.update({ where: { id: users[0] }, data: { role: 'USER' } })
  }, { timeout: 15000 })
  await locked
  const editing = updateCatalogProduct(users[0], form).then(() => null).catch((error: unknown) => error)
  try { expect(await waitingOnProduct()).toBe(true) }
  finally { release(); await blocker; await editing; await prisma.user.update({ where: { id: users[0] }, data: { role: 'ADMIN' } }) }
  expect(await editing).toMatchObject({ code: 'FORBIDDEN' })
  expect(await prisma.activityLog.count({ where: { entityId: productId } })).toBe(0)
})

test('ordinary and closed accounts cannot create, edit or toggle products', async () => {
  for (const actor of [users[1], randomUUID()]) {
    const form = await productForm({ stockCount: '7' })
    await expect(createCatalogProduct(actor, form)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(updateCatalogProduct(actor, form)).rejects.toMatchObject({ code: 'FORBIDDEN' })
    await expect(toggleCatalogProduct(actor, form)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  }
  await prisma.user.update({ where: { id: users[0] }, data: { closedAt: new Date() } })
  try { await expect(updateCatalogProduct(users[0], await productForm())).rejects.toMatchObject({ code: 'FORBIDDEN' }) }
  finally { await prisma.user.update({ where: { id: users[0] }, data: { closedAt: null } }) }
})

test('audit failure rolls back product editing and activation changes', async () => {
  const before = await prisma.product.findUniqueOrThrow({ where: { id: productId } })
  const constraint = `qa_stock_${randomUUID().replaceAll('-', '')}`
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "${constraint}" CHECK ("entityId" <> '${productId}') NOT VALID`)
  try {
    await expect(updateCatalogProduct(users[0], await productForm({ stockCount: '7' }))).rejects.toThrow()
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toEqual(before)
    await expect(toggleCatalogProduct(users[0], await productForm())).rejects.toThrow()
    expect(await prisma.product.findUniqueOrThrow({ where: { id: productId } })).toEqual(before)
  } finally { await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${constraint}"`) }
})

test('activation uses the reviewed state and refuses repeat or stale toggles', async () => {
  const form = await productForm()
  form.set('isActive', 'false')
  expect(await toggleCatalogProduct(users[0], form)).toMatchObject({ isActive: false })
  await expect(toggleCatalogProduct(users[0], form)).rejects.toMatchObject({ code: 'PRODUCT_CHANGED' })
  expect(await toggleCatalogProduct(users[0], await productForm())).toMatchObject({ isActive: true })
  expect(await prisma.activityLog.count({ where: { entityId: productId } })).toBe(2)
})

test('duplicate product slugs return a safe conflict without another creation or audit', async () => {
  const form = await productForm()
  const product = await createCatalogProduct(users[0], form); products.push(product.id)
  await expect(createCatalogProduct(users[0], form)).rejects.toMatchObject({ code: 'PRODUCT_SLUG_IN_USE' })
  expect(await prisma.product.count({ where: { slug: product.slug } })).toBe(1)
  expect(await prisma.activityLog.count({ where: { entityId: product.id } })).toBe(1)
})
