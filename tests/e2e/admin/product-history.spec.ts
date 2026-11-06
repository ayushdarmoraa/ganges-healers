import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'

test('store administrators deactivate purchased products and confirm deletion only for unreferenced products', async ({ page }) => {
  test.setTimeout(180000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const suffix = randomUUID(), users: string[] = [], products: string[] = []
  let bundleId = '', paymentId = ''
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.92' })
  try {
    for (const role of ['ADMIN', 'USER'] as const) users.push((await db.user.create({ data: { email: `history-${role.toLowerCase()}-${suffix}@example.test`, role } })).id)
    for (const kind of ['purchased', 'unused', 'bundled']) products.push((await db.product.create({ data: { slug: `history-${kind}-${suffix}`, title: `History ${kind} ${suffix}`, pricePaise: 1000 } })).id)
    const order = await db.order.create({ data: { userId: users[1], totalPaise: 2000, status: 'paid', items: { create: { productId: products[0], quantity: 2, pricePaise: 1000 } } } })
    paymentId = (await db.payment.create({ data: { userId: users[1], type: 'STORE', gateway: 'razorpay', amountPaise: 2000, status: 'success', statusEnum: 'SUCCESS', metadata: { orderId: order.id } } })).id
    await db.order.update({ where: { id: order.id }, data: { paymentId } })
    bundleId = (await db.productBundle.create({ data: { slug: `history-bundle-${suffix}`, title: `Bundle ${suffix}`, pricePaise: 900, items: { create: { productId: products[2] } } } })).id
    const savedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } }), savedPayment = await db.payment.findUniqueOrThrow({ where: { id: paymentId } })
    expect((await page.request.get(`/api/test/login?${new URLSearchParams({ role: 'ADMIN', email: `history-admin-${suffix}@example.test` })}`)).status()).toBe(200)
    await page.goto('/admin/products')
    const purchased = page.getByRole('article', { name: `Product History purchased ${suffix}`, exact: true })
    await expect(purchased.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled({ timeout: 30000 })
    await expect(purchased.getByText(/history is protected/)).toBeVisible()
    await purchased.getByRole('button', { name: 'Deactivate', exact: true }).click()
    await expect(purchased.getByText('(Inactive)', { exact: true })).toBeVisible({ timeout: 30000 })
    expect((await db.product.findUniqueOrThrow({ where: { id: products[0] } })).isActive).toBe(false)
    const bundled = page.getByRole('article', { name: `Product History bundled ${suffix}`, exact: true })
    await expect(bundled.getByRole('button', { name: 'Delete', exact: true })).toBeDisabled()
    const unused = page.getByRole('article', { name: `Product History unused ${suffix}`, exact: true })
    await unused.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Keep product', exact: true }).click()
    expect(await db.product.count({ where: { id: products[1] } })).toBe(1)
    await unused.getByRole('button', { name: 'Delete', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete product permanently', exact: true }).click()
    // Modal background content is aria-hidden while submission is pending.
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 30000 })
    await expect(unused).toHaveCount(0, { timeout: 30000 })
    expect(await db.product.count({ where: { id: products[1] } })).toBe(0)
    expect(await db.activityLog.count({ where: { userId: users[0], entityId: products[1], action: 'product_deleted' } })).toBe(1)
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } })).toEqual(savedOrder)
    expect(await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).toEqual(savedPayment)
    expect(await db.bundleItem.count({ where: { bundleId, productId: products[2] } })).toBe(1)
  } finally {
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      if (paymentId) await db.payment.deleteMany({ where: { id: paymentId } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (bundleId) await db.productBundle.deleteMany({ where: { id: bundleId } })
      await db.product.deleteMany({ where: { id: { in: products } } })
    } finally { await db.$disconnect() }
  }
})
