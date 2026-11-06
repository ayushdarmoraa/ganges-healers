import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('a completed session can be reviewed once and its actual rating appears on the service catalog and detail page', async ({ page, browser, baseURL }) => {
  test.setTimeout(120000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = randomUUID()
  const other = await browser.newContext({ baseURL })
  const users: string[] = []
  let serviceId = ''
  try {
    const login = await page.goto(`/api/test/login?role=USER&email=review-${token}@example.test`)
    expect(login?.ok()).toBeTruthy()
    const userId: string = (await login!.json()).userId
    users.push(userId)
    await db.user.update({ where: { id: userId }, data: { name: 'Review Journey Customer' } })
    const healerUser = await db.user.create({ data: { email: `review-healer-${token}@example.test`, name: 'Review Journey Healer', role: 'HEALER' } })
    users.push(healerUser.id)
    const healer = await db.healer.create({ data: { userId: healerUser.id, specializations: [`Review ${token}`] } })
    const service = await db.service.create({ data: { slug: `review-${token}`, name: `Review ${token}`, description: 'A review journey session.', category: 'Test', price: 100, duration: 60 } })
    serviceId = service.id
    const booking = await db.booking.create({ data: { userId, healerId: healer.id, serviceId, scheduledAt: new Date(Date.now() - 86400000), status: 'COMPLETED', durationMin: 60, pricePaise: 10000 } })
    await page.goto('/dashboard/bookings')
    await page.getByRole('tab', { name: /Past/ }).click()
    const card = page.locator('[data-test="booking-card"]').filter({ hasText: service.name })
    await expect(card).toBeVisible({ timeout: 30000 })
    await card.getByRole('button', { name: 'Write a review' }).click()
    const rating = card.getByRole('radio', { name: '4 stars' })
    await card.locator('label').filter({ has: page.getByRole('radio', { name: '4 stars', exact: true }) }).click()
    await expect(rating).toBeChecked()
    const comment = `Thoughtful guidance ${token}`
    await card.getByLabel('Your review (optional)').fill(comment)
    const saved = page.waitForResponse(response => response.url().endsWith(`/api/bookings/${booking.id}/review`) && response.request().method() === 'POST')
    await card.getByRole('button', { name: 'Submit review' }).click()
    expect((await saved).status()).toBe(201)
    await expect(card.getByRole('status')).toHaveText('Your review · 4 out of 5 stars')
    await expect(card.getByText(comment)).toBeVisible()
    await page.reload()
    await page.getByRole('tab', { name: /Past/ }).click()
    await expect(card.getByRole('status')).toHaveText('Your review · 4 out of 5 stars')
    await expect(card.getByRole('button', { name: 'Write a review' })).toHaveCount(0)
    expect(await db.review.count({ where: { bookingId: booking.id } })).toBe(1)
    const otherLogin = await other.request.get(`/api/test/login?role=USER&email=review-stranger-${token}@example.test`)
    users.push((await otherLogin.json()).userId)
    expect((await other.request.post(`/api/bookings/${booking.id}/review`, { data: { rating: 5 } })).status()).toBe(404)
    await page.goto(`/services?search=${encodeURIComponent(service.name)}`)
    await expect(page.locator('[data-test="service-card"]').filter({ hasText: service.name }).getByLabel('4.0 out of 5 from 1 review')).toBeVisible()
    const minimum = page.getByLabel('Minimum rating (out of 5)')
    await minimum.fill('4.1')
    await page.getByRole('button', { name: 'Apply Filters' }).click()
    await expect(page.getByText('No matching services', { exact: true })).toBeVisible()
    await expect(minimum).toHaveValue('4.1')
    await page.goBack()
    await expect(minimum).toHaveValue('')
    await expect(page.locator('[data-test="service-card"]').filter({ hasText: service.name })).toBeVisible()
    await minimum.fill('4')
    await minimum.press('Enter')
    await expect(page).toHaveURL(/minRating=4(?:&|$)/)
    await expect(page.locator('[data-test="service-card"]').filter({ hasText: service.name })).toBeVisible()
    await page.goto(`/services/${service.slug}`)
    await expect(page.getByRole('heading', { name: 'Reviews', exact: true })).toBeVisible()
    await expect(page.getByText(comment)).toBeVisible()
    await expect(page.getByText('Verified Session', { exact: true })).toBeVisible()
  } finally {
    await other.close()
    try {
      if (users.length) await db.user.deleteMany({ where: { id: { in: users } } })
      if (serviceId) await db.service.delete({ where: { id: serviceId } })
    } finally { await db.$disconnect() }
  }
})
