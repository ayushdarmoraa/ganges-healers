import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('a practitioner publishes a session link to its customer and calendar and completes only an ended session', async ({ page, browser, baseURL }) => {
  test.setTimeout(180000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const suffix = randomUUID(), users: string[] = []
  let serviceId = '', bookingId = ''
  const customerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.81' } })
  const customer = await customerContext.newPage()
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.80' })
  try {
    for (const role of ['HEALER', 'USER'] as const) {
      const email = `delivery-${role.toLowerCase()}-${suffix}@example.test`
      users.push((await db.user.create({ data: { email, role, name: `${role} Session Delivery` } })).id)
      const target = role === 'HEALER' ? page : customer
      expect((await target.request.get(`/api/test/login?${new URLSearchParams({ role, email })}`)).status()).toBe(200)
    }
    const healer = await db.healer.create({ data: { userId: users[0] } })
    serviceId = (await db.service.create({ data: { slug: `delivery-${suffix}`, name: `Delivery ${suffix}`, description: 'Isolated session delivery fixture', category: 'Test', price: 10, duration: 60 } })).id
    bookingId = (await db.booking.create({ data: { healerId: healer.id, userId: users[1], serviceId, scheduledAt: new Date(Date.now() + 86400000), durationMin: 60, pricePaise: 1000, status: 'CONFIRMED', payment: { create: { gateway: 'vip_credit', amountPaise: 0, status: 'success' } } } })).id
    const ended = await db.booking.create({ data: { healerId: healer.id, userId: users[1], serviceId, scheduledAt: new Date(Date.now() - 7200000), durationMin: 60, pricePaise: 0, status: 'RESCHEDULED' } })
    await page.goto('/healer/bookings')
    const link = `https://meet.example.test/${suffix}`
    await page.getByLabel(`Session link for Delivery ${suffix}`, { exact: true }).fill(link)
    await page.getByRole('button', { name: 'Save session link', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Join session', exact: true })).toHaveAttribute('href', link, { timeout: 30000 })
    await expect(page.getByRole('button', { name: 'Complete session', exact: true })).toBeDisabled()
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('CONFIRMED')
    await customer.goto('/dashboard/bookings')
    await expect(customer.getByRole('link', { name: 'Join session', exact: true })).toHaveAttribute('href', link, { timeout: 30000 })
    const calendar = await customer.request.get(`/api/bookings/${bookingId}/calendar`)
    expect(calendar.status()).toBe(200)
    expect(await calendar.text()).toContain(`URL:${link}`)
    expect((await customer.request.get('/api/healer/bookings')).status()).toBe(403)
    await page.getByRole('tab', { name: 'Past (1)', exact: true }).click()
    await page.getByRole('button', { name: 'Complete session', exact: true }).click()
    await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible({ timeout: 30000 })
    expect((await db.booking.findUniqueOrThrow({ where: { id: ended.id } })).status).toBe('COMPLETED')
    expect((await db.payment.findUniqueOrThrow({ where: { bookingId } })).gateway).toBe('vip_credit')
  } finally {
    await customerContext.close()
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (serviceId) await db.service.delete({ where: { id: serviceId } })
    } finally { await db.$disconnect() }
  }
})
