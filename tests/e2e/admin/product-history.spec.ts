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

test('staff replenish counted stock, recover a stale draft and preserve customer quotes', async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = randomUUID(), slug = `stock-editor-${token}`, title = `Inventory mat ${token}`
  const users: string[] = []
  const buyer = await browser.newContext({ baseURL })
  try {
    const adminLogin = await page.goto(`/api/test/login?role=ADMIN&email=stock-admin-${token}@example.test`)
    expect(adminLogin?.ok()).toBeTruthy(); users.push((await adminLogin!.json()).userId)
    const buyerLogin = await buyer.request.get(`/api/test/login?role=USER&email=stock-buyer-${token}@example.test`)
    expect(buyerLogin.ok()).toBeTruthy(); users.push((await buyerLogin.json()).userId)
    await page.goto('/admin/products')
    const create = page.getByRole('form', { name: 'Create product', exact: true })
    await create.getByLabel('Title', { exact: true }).fill(title)
    await create.getByLabel('Slug', { exact: true }).fill(slug)
    await create.getByLabel('Price (paise)', { exact: true }).fill('2500')
    await create.getByLabel('Stock quantity', { exact: true }).fill('3')
    await create.getByRole('button', { name: 'Create Product', exact: true }).click()
    const row = page.getByRole('article', { name: `Product ${title}`, exact: true })
    await expect(row).toBeVisible({ timeout: 30_000 })
    const product = await db.product.findUniqueOrThrow({ where: { slug } })
    expect(product).toMatchObject({ stockCount: 3, stockStatus: 'LOW' })
    const order = await db.order.create({ data: { userId: users[1], totalPaise: 5000, items: { create: { productId: product.id, quantity: 2, pricePaise: 5000 } } } })
    const payment = await db.payment.create({ data: { userId: users[1], type: 'STORE', gateway: 'razorpay', gatewayOrderId: `order_${token}`, status: 'pending', statusEnum: 'PENDING', amountPaise: 5000, metadata: { orderId: order.id } } })
    const savedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } })
    await page.setViewportSize({ width: 390, height: 844 })
    await row.getByText('Edit', { exact: true }).click()
    await row.getByLabel('Stock quantity', { exact: true }).fill('7')
    await row.getByLabel('Price (paise)', { exact: true }).fill('3000')
    await db.product.update({ where: { id: product.id }, data: { stockCount: 0, stockStatus: 'OUT', updatedAt: product.updatedAt } })
    await row.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row.getByRole('alert')).toContainText('stock changed')
    await expect(row.getByLabel('Stock quantity', { exact: true })).toHaveValue('7')
    expect((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockCount).toBe(0)
    const quote = () => buyer.request.post('/api/payments/create-order', { data: { type: 'STORE', metadata: { orderId: order.id } } })
    expect((await quote()).status()).toBe(409)
    await row.screenshot({ path: testInfo.outputPath('product-stock-editing-mobile.png') })
    await row.getByRole('button', { name: 'Discard drafts and reload', exact: true }).click()
    await row.getByText('Edit', { exact: true }).click()
    await expect(row.getByLabel('Stock quantity', { exact: true })).toHaveValue('0')
    await row.getByLabel('Stock quantity', { exact: true }).fill('7')
    await row.getByLabel('Price (paise)', { exact: true }).fill('3000')
    await row.getByLabel('Stock Status', { exact: true }).selectOption('IN_STOCK')
    await row.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(row.getByText(/7 units/)).toBeVisible()
    expect(await db.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ stockCount: 7, stockStatus: 'IN_STOCK', pricePaise: 3000 })
    const restored = await quote()
    expect(restored.status()).toBe(200)
    expect(await restored.json()).toMatchObject({ orderId: payment.gatewayOrderId, amountPaise: 5000 })
    await row.getByRole('button', { name: 'Deactivate', exact: true }).click()
    await expect(row.getByText('(Inactive)', { exact: true })).toBeVisible()
    expect((await quote()).status()).toBe(409)
    await row.getByRole('button', { name: 'Activate', exact: true }).click()
    await expect(row.getByText('(Inactive)', { exact: true })).toHaveCount(0)
    expect((await quote()).status()).toBe(200)
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } })).toEqual(savedOrder)
    expect(await db.payment.findUniqueOrThrow({ where: { id: payment.id } })).toEqual(payment)
    expect(await db.activityLog.count({ where: { entityId: product.id, action: 'product_updated' } })).toBe(1)
    const customer = await buyer.newPage()
    await customer.goto('/admin/products')
    await expect(customer).toHaveURL('/')
  } finally {
    await buyer.close()
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      await db.product.deleteMany({ where: { slug } })
    } finally { await db.$disconnect() }
  }
})
