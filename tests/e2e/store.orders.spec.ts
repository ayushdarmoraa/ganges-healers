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
    await page.getByRole('link', { name: 'View details', exact: true }).first().click()
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
