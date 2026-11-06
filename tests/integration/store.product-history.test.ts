import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { deleteUnreferencedProduct, productDeleteVersion } from '@/lib/store/admin'

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
