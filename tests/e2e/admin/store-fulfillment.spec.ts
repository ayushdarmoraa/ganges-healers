import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'

test('staff records a paid shipment and delivery and only the customer sees the tracking in My Orders', async ({ page, browser, baseURL }) => {
  test.setTimeout(150000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = randomUUID()
  const users: string[] = []
  let productId = ''
  const customer = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.112' } })
  const outsider = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.113' } })
  try {
    const login = async (context: typeof customer, role: 'ADMIN' | 'USER', prefix: string) => {
      const email = `shipment-${prefix}-${token}@example.test`
      const user = await db.user.create({ data: { email, role } })
      users.push(user.id)
      const response = await context.request.get(`/api/test/login?${new URLSearchParams({ email, role })}`)
      expect(response.ok()).toBe(true)
      expect(await response.json()).toMatchObject({ userId: user.id })
      return user.id
    }
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.111' })
    const adminId = await login(page.context(), 'ADMIN', 'admin')
    const userId = await login(customer, 'USER', 'buyer')
    await login(outsider, 'USER', 'other')
    productId = (await db.product.create({ data: { slug: `fulfillment-${token}`, title: 'Shipment fixture', pricePaise: 12000 } })).id
    const order = await db.order.create({ data: {
      userId, status: 'paid', totalPaise: 12000,
      shippingAddress: { name: 'Fixture Recipient', line1: 'Test lane', city: 'Delhi', state: 'Delhi', postalCode: '110001' },
      items: { create: { productId, quantity: 1, pricePaise: 12000 } },
    } })
    const payment = await db.payment.create({ data: {
      userId, type: 'STORE', gateway: 'razorpay', gatewayPaymentId: `test-${token}`, status: 'success', statusEnum: 'SUCCESS',
      amountPaise: 12000, metadata: { orderId: order.id },
    } })
    await db.order.update({ where: { id: order.id }, data: { paymentId: payment.id } })

    await page.goto('/admin')
    await page.getByRole('link', { name: 'Manage Orders', exact: true }).click()
    await page.getByRole('link', { name: `Order ${order.id}`, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Order fulfillment' })).toBeVisible()
    await expect(page.getByText('Fixture Recipient')).toBeVisible()
    await page.getByLabel('Carrier').fill('Example Courier')
    const tracking = page.getByLabel('Tracking number')
    await tracking.fill('https://invalid.example')
    await page.getByRole('button', { name: 'Mark shipped' }).click()
    const editor = page.locator('form').filter({ has: page.getByLabel('Carrier') })
    await expect(editor.getByRole('alert')).toContainText('Check the carrier and tracking number')
    await expect(page.getByLabel('Carrier')).toHaveValue('Example Courier')
    await tracking.fill('ORDER-0123')
    await page.getByRole('button', { name: 'Mark shipped' }).click()
    await expect(page.getByRole('heading', { name: 'Record delivery' })).toBeVisible()

    const ownerPage = await customer.newPage()
    const details = `/dashboard/orders/${order.id}`
    await ownerPage.goto(details)
    await expect(ownerPage.getByRole('heading', { name: 'Shipment tracking' })).toBeVisible()
    await expect(ownerPage.getByRole('main').getByText('ORDER-0123', { exact: true })).toBeVisible()
    const api = `/api/store/orders/${order.id}`
    expect(await (await customer.request.get(api)).json()).toMatchObject({
      order: { status: 'shipped', tracking: { shipment: { carrier: 'Example Courier', trackingNumber: 'ORDER-0123' } } },
    })
    const rejected = await outsider.request.get(api)
    expect(rejected.status()).toBe(403)
    expect(await rejected.text()).not.toContain('ORDER-0123')
    const adminOnly = await outsider.request.get(`/admin/orders/${order.id}`, { maxRedirects: 0 })
    expect(adminOnly.status()).toBe(307)
    expect(await adminOnly.text()).not.toContain('Fixture Recipient')

    await page.getByLabel('I confirmed this order was delivered.').check()
    await page.getByRole('button', { name: 'Mark delivered' }).click()
    await expect(page.getByRole('main').getByText(/^Delivery recorded /)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Mark delivered' })).toHaveCount(0)
    await ownerPage.reload()
    await expect(ownerPage.getByRole('main').getByText(/Delivery recorded/)).toBeVisible()
    expect(await db.order.findUniqueOrThrow({ where: { id: order.id } })).toMatchObject({ status: 'delivered', paymentId: payment.id })
    expect(await db.activityLog.count({ where: { entityId: order.id, userId: adminId } })).toBe(2)
  } finally {
    await Promise.allSettled([customer.close(), outsider.close()])
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (productId) await db.product.deleteMany({ where: { id: productId } })
    } finally { await db.$disconnect() }
  }
})
