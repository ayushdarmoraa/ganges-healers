import crypto from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('customers filter and page orders, inspect totals, and cannot view another account’s order', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = crypto.randomUUID()
  const other = await browser.newContext({ baseURL })
  const users: string[] = []
  let productId = ''
  try {
    const login = await page.goto(`/api/test/login?role=USER&email=orders-${token}@example.test`)
    expect(login?.ok()).toBeTruthy()
    const ownerId: string = (await login!.json()).userId
    expect(ownerId).toBeTruthy()
    users.push(ownerId)
    const otherLogin = await other.request.get(`/api/test/login?role=USER&email=other-orders-${token}@example.test`)
    expect(otherLogin.ok()).toBeTruthy()
    const otherId: string = (await otherLogin.json()).userId
    expect(otherId).toBeTruthy()
    users.push(otherId)
    const product = await db.product.create({ data: { slug: `order-mat-${token}`, title: 'Order verification mat', pricePaise: 40000 } })
    productId = product.id
    const paidIds = Array.from({ length: 52 }, (_, index) => `order-${token}-${index}`)
    await db.order.createMany({ data: paidIds.map((id, index) => ({
      id, userId: ownerId, status: 'paid', totalPaise: 120000,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 52 - index)),
      shippingAddress: { name: 'Order Test Customer', line1: 'Private practice address', city: 'Rishikesh', state: 'Uttarakhand', postalCode: '249201' },
    })) })
    await db.orderItem.create({ data: { orderId: paidIds[0], productId, quantity: 3, pricePaise: 120000 } })
    const shipped = await db.order.create({ data: { userId: ownerId, status: 'shipped', totalPaise: 40000 } })
    const foreign = await db.order.create({ data: { userId: otherId, status: 'paid', totalPaise: 99900 } })

    await page.goto('/dashboard/orders?status=paid')
    await expect(page.getByRole('heading', { name: 'My Orders', exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('link', { name: 'View details', exact: true })).toHaveCount(50)
    await expect(page.getByText(`Order ID: ${foreign.id}`, { exact: true })).toHaveCount(0)
    await page.getByRole('link', { name: 'Next page', exact: true }).click()
    await expect(page).toHaveURL(/status=paid&page=2$/)
    await expect(page.getByRole('link', { name: 'View details', exact: true })).toHaveCount(2)
    await expect(page.getByRole('link', { name: 'Next page', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Previous page', exact: true })).toHaveAttribute('href', '/dashboard/orders?status=paid')

    await page.getByRole('link', { name: 'Shipped', exact: true }).click()
    await expect(page).toHaveURL(/orders\?status=shipped$/)
    await expect(page.getByRole('link', { name: 'View details', exact: true })).toHaveCount(1)
    await expect(page.getByText(`Order ID: ${shipped.id}`, { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Paid', exact: true }).click()
    await expect(page).toHaveURL(/orders\?status=paid$/)
    await expect(page.getByRole('link', { name: 'View details', exact: true })).toHaveCount(50)
    await page.locator(`a[href="/dashboard/orders/${paidIds[0]}"]`).click()
    await expect(page).toHaveURL(new RegExp(`/dashboard/orders/${paidIds[0]}$`))
    await expect(page.getByRole('heading', { name: 'Order Details', exact: true })).toBeVisible()
    await expect(page.getByText('Quantity: 3', { exact: true })).toBeVisible()
    await expect(page.getByText('₹1,200.00', { exact: true })).toHaveCount(2)
    await expect(page.getByText('Private practice address', { exact: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Order progress' }).locator('[aria-current="step"]')).toContainText('Paid')

    const stranger = await other.newPage()
    await stranger.goto(`/dashboard/orders/${paidIds[0]}`)
    await expect(stranger.getByRole('heading', { name: 'Order unavailable', exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(stranger.getByText('Private practice address', { exact: true })).toHaveCount(0)
    expect((await other.request.get(`/api/store/orders/${paidIds[0]}`)).status()).toBe(403)
  } finally {
    await other.close()
    try {
      if (users.length) await db.user.deleteMany({ where: { id: { in: users } } })
      if (productId) await db.product.delete({ where: { id: productId } })
    } finally {
      await db.$disconnect()
    }
  }
})

test('checkout recovers lost responses and confirms the saved payment without duplicate orders or stock changes', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = crypto.randomUUID()
  const checkoutKey = crypto.randomUUID()
  const gatewayOrderId = `order_${token}`
  const gatewayPaymentId = `pay_${token}`
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${gatewayOrderId}|${gatewayPaymentId}`).digest('hex')
  const shippingAddress = { name: 'Retry Customer', line1: 'Retry test lane', city: 'Delhi', state: 'Delhi', postalCode: '110001' }
  let userId = '', productId = ''
  try {
    const login = await page.goto(`/api/test/login?role=USER&email=checkout-retry-${token}@example.test`)
    expect(login?.ok()).toBeTruthy()
    userId = (await login!.json()).userId
    const product = await db.product.create({ data: { slug: `retry-mat-${token}`, title: 'Retry practice mat', pricePaise: 10000, stockCount: 4 } })
    productId = product.id
    const saved = await db.order.create({ data: { userId, checkoutKey, totalPaise: 10000, shippingAddress, items: { create: { productId, quantity: 1, pricePaise: 10000 } } } })
    await db.payment.create({ data: { userId, type: 'STORE', gateway: 'razorpay', gatewayOrderId, amountPaise: 10000, status: 'pending', statusEnum: 'PENDING', metadata: { orderId: saved.id } } })
    await page.addInitScript(({ product, payment }) => {
      localStorage.setItem('ganges-cart', JSON.stringify([{ productId: product.id, slug: product.slug, title: product.title, pricePaise: product.pricePaise, quantity: 1, imageUrl: null }]))
      // The external payment dialog is stubbed; checkout, signed verification and inventory stay real.
      window.Razorpay = class {
        constructor(private options: { handler: (result: typeof payment) => void }) {}
        open() { this.options.handler(payment) }
      }
    }, { product: { id: product.id, slug: product.slug, title: product.title, pricePaise: product.pricePaise }, payment: { razorpay_order_id: gatewayOrderId, razorpay_payment_id: gatewayPaymentId, razorpay_signature: signature } })
    const keys: string[] = []
    let loseCheckout = true
    let loseConfirmation = true
    await page.route('**/api/store/checkout', async route => {
      keys.push(route.request().postDataJSON().checkoutKey)
      if (loseCheckout) {
        loseCheckout = false
        expect((await route.fetch()).status()).toBe(200)
        await route.abort('failed')
      } else await route.continue()
    })
    await page.route('**/api/payments/verify', async route => {
      if (loseConfirmation) {
        loseConfirmation = false
        const committed = await route.fetch()
        expect(committed.status()).toBe(200)
        expect((await committed.json()).verified).toBe(true)
        await route.abort('failed')
      } else await route.continue()
    })
    await page.goto('/store/checkout')
    await expect(page.getByRole('heading', { name: 'Checkout', exact: true })).toBeVisible()
    await page.evaluate(async ({ userId, productId, shippingAddress, checkoutKey }) => {
      const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ userId, cart: [{ productId, quantity: 1 }], shippingAddress })))
      const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      sessionStorage.setItem(`ganges-store-checkout:${userId}`, JSON.stringify({ fingerprint, key: checkoutKey }))
    }, { userId, productId, shippingAddress, checkoutKey })
    const fillAddress = async () => {
      await expect(page.getByRole('button', { name: 'Open user menu', exact: true })).toBeEnabled()
      for (const [label, value] of [['Full Name *', shippingAddress.name], ['Address Line 1 *', shippingAddress.line1], ['City *', shippingAddress.city], ['State *', shippingAddress.state], ['Postal Code *', shippingAddress.postalCode]]) await page.getByLabel(label, { exact: true }).fill(value)
    }
    await fillAddress()
    await page.getByRole('button', { name: 'Pay ₹100.00', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: /fetch|network|connection/i }).first()).toBeVisible()
    await page.reload()
    await fillAddress()
    await page.getByRole('button', { name: 'Pay ₹100.00', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Confirm payment', exact: true })).toBeEnabled()
    await expect(page.getByRole('link', { name: 'View saved order' })).toHaveAttribute('href', `/dashboard/orders/${saved.id}`)
    await page.screenshot({ path: testInfo.outputPath('checkout-confirmation-recovery.png'), fullPage: true })
    await page.getByRole('button', { name: 'Confirm payment', exact: true }).click()
    await expect(page.getByText('Order placed!', { exact: true })).toBeVisible()
    expect(keys).toEqual([checkoutKey, checkoutKey])
    expect(await db.order.count({ where: { userId } })).toBe(1)
    expect(await db.payment.count({ where: { userId } })).toBe(1)
    expect((await db.order.findUniqueOrThrow({ where: { id: saved.id } })).status).toBe('paid')
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockCount).toBe(3)
  } finally {
    if (userId) await db.user.deleteMany({ where: { id: userId } })
    if (productId) await db.product.deleteMany({ where: { id: productId } })
    await db.$disconnect()
  }
})

test('a customer resumes a legacy saved order from its details and keeps an unrelated cart', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = crypto.randomUUID()
  const gatewayOrderId = `order_${token}`, gatewayPaymentId = `pay_${token}`
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${gatewayOrderId}|${gatewayPaymentId}`).digest('hex')
  let userId = '', productId = ''
  try {
    const login = await page.goto(`/api/test/login?role=USER&email=saved-order-${token}@example.test`)
    expect(login?.ok()).toBeTruthy()
    userId = (await login!.json()).userId
    const product = await db.product.create({ data: { slug: `saved-order-${token}`, title: 'Saved practice mat', pricePaise: 22000, stockCount: 4 } })
    productId = product.id
    const order = await db.order.create({ data: { userId, totalPaise: 25000, items: { create: { productId, quantity: 2, pricePaise: 25000 } } } })
    await db.payment.create({ data: { userId, type: 'STORE', gateway: 'razorpay', gatewayOrderId, amountPaise: 25000, status: 'pending', statusEnum: 'PENDING', metadata: { orderId: order.id } } })
    const cart = [{ productId, slug: product.slug, title: product.title, pricePaise: product.pricePaise, quantity: 1, imageUrl: null }]
    await page.addInitScript(({ cart, payment }) => {
      localStorage.setItem('ganges-cart', JSON.stringify(cart))
      window.Razorpay = class {
        constructor(private options: { handler: (result: typeof payment) => void; amount: number }) {}
        open() {
          document.body.dataset.checkoutAmount = String(this.options.amount)
          this.options.handler(payment)
        }
      }
    }, { cart, payment: { razorpay_order_id: gatewayOrderId, razorpay_payment_id: gatewayPaymentId, razorpay_signature: signature } })
    let loseConfirmation = true
    await page.route('**/api/payments/verify', async route => {
      if (loseConfirmation) {
        loseConfirmation = false
        expect((await route.fetch()).status()).toBe(200)
        await route.abort('failed')
      } else await route.continue()
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/dashboard/orders/${order.id}`)
    await expect(page.getByRole('button', { name: 'Continue payment', exact: true })).toBeEnabled({ timeout: 30_000 })
    await db.product.update({ where: { id: productId }, data: { stockCount: 1 } })
    await page.getByRole('button', { name: 'Continue payment', exact: true }).click()
    await expect(page.getByRole('alert').filter({ hasText: /currently unavailable/i })).toBeVisible()
    expect(await page.locator('body').getAttribute('data-checkout-amount')).toBeNull()
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe('pending_payment')
    expect(await db.payment.count({ where: { userId } })).toBe(1)
    await db.product.update({ where: { id: productId }, data: { stockCount: 4 } })
    await page.getByRole('button', { name: 'Continue payment', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Confirm payment', exact: true })).toBeEnabled()
    await expect(page.getByRole('alert').filter({ hasText: /could not confirm/i })).toBeVisible()
    expect(await page.locator('body').getAttribute('data-checkout-amount')).toBe('25000')
    await page.screenshot({ path: testInfo.outputPath('saved-order-mobile-recovery.png'), fullPage: true })
    await page.getByRole('button', { name: 'Confirm payment', exact: true }).click()
    await expect(page.getByRole('list', { name: 'Order progress' }).locator('[aria-current="step"]')).toContainText('Paid')
    await expect(page.getByRole('button', { name: 'Continue payment', exact: true })).toHaveCount(0)
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('ganges-cart') || 'null'))).toEqual(cart)
    expect(await db.order.count({ where: { userId } })).toBe(1)
    expect(await db.payment.count({ where: { userId } })).toBe(1)
    expect((await db.product.findUniqueOrThrow({ where: { id: productId } })).stockCount).toBe(2)
  } finally {
    if (userId) await db.user.deleteMany({ where: { id: userId } })
    if (productId) await db.product.deleteMany({ where: { id: productId } })
    await db.$disconnect()
  }
})
