import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'

test('an administrator retains a product draft after an unavailable photo upload and explicitly creates it without that image', async ({ page, browser, baseURL }) => {
  test.setTimeout(180000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const suffix = randomUUID(), slug = `upload-draft-${suffix}`, title = `Photo draft ${suffix}`, users: string[] = []
  const customer = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.91' } })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCioAAAAASUVORK5CYII=', 'base64')
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.90' })
  try {
    for (const role of ['ADMIN', 'USER'] as const) {
      const email = `photo-${role.toLowerCase()}-${suffix}@example.test`
      users.push((await db.user.create({ data: { email, role } })).id)
      expect((await (role === 'ADMIN' ? page.request : customer.request).get(`/api/test/login?${new URLSearchParams({ role, email })}`)).status()).toBe(200)
    }
    expect((await customer.request.post('/api/admin/upload-product-image', { multipart: { file: { name: 'photo.png', mimeType: 'image/png', buffer: png } } })).status()).toBe(403)
    await page.goto('/admin/products')
    const editor = page.getByRole('form', { name: 'Create product', exact: true })
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title)
    await page.getByRole('textbox', { name: 'Slug', exact: true }).fill(slug)
    await page.getByRole('spinbutton', { name: 'Price (paise)', exact: true }).fill('12345')
    await page.getByLabel('Product Image', { exact: true }).setInputFiles({ name: 'unsafe.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') })
    await expect(editor.getByRole('alert')).toContainText('Choose a JPEG, PNG or WebP image.')
    const attempted = page.waitForResponse(response => response.url().endsWith('/api/admin/upload-product-image') && response.request().method() === 'POST')
    await page.getByLabel('Product Image', { exact: true }).setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png })
    expect((await attempted).status()).toBe(503)
    await expect(editor.getByRole('alert')).toContainText('temporarily unavailable')
    await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(title)
    await expect(page.getByRole('button', { name: 'Create Product', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Remove failed image from draft', exact: true }).click()
    await page.getByRole('button', { name: 'Create Product', exact: true }).click()
    await expect(editor.getByRole('status')).toHaveText('Product created.', { timeout: 30000 })
    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 30000 })
    const product = await db.product.findUniqueOrThrow({ where: { slug } })
    expect(product).toMatchObject({ title, pricePaise: 12345, imageUrl: null })
    await page.goto(`/store/${slug}`)
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible({ timeout: 30000 })
  } finally {
    await customer.close()
    try { await db.product.deleteMany({ where: { slug } }); await db.user.deleteMany({ where: { id: { in: users } } }) }
    finally { await db.$disconnect() }
  }
})
