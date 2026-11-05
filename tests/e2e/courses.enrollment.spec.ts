import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('a customer enrolls in a free course and reaches its gated lesson without payment checkout', async ({ page }) => {
  test.setTimeout(120000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const email = `free-course-${randomUUID()}@example.test`
  let userId = ''
  let courseId = ''
  const gatewayRequests: string[] = []
  page.on('request', request => { if (new URL(request.url()).hostname.endsWith('razorpay.com')) gatewayRequests.push(request.url()) })
  try {
    userId = (await db.user.create({ data: { email, name: 'Free Course Customer' } })).id
    const course = await db.course.create({ data: {
      slug: `free-course-${randomUUID()}`, title: 'Free Practice Course', description: 'An isolated free enrollment test.', pricePaise: 0,
      lessons: { create: { title: 'First Free Practice', order: 1, content: '<p>Practice content for the isolated browser test.</p>' } },
    }, include: { lessons: true } })
    courseId = course.id
    // This is the guarded local test helper, never a production login or real gateway purchase.
    expect((await page.request.get(`/api/test/login?${new URLSearchParams({ role: 'USER', email })}`)).status()).toBe(200)
    await page.goto(`/courses/${course.slug}`)
    const enroll = page.getByRole('button', { name: 'Enroll for free', exact: true })
    await expect(enroll).toBeEnabled({ timeout: 30000 })
    await enroll.click()
    await expect(page).toHaveURL(new RegExp(`/courses/${course.slug}/lesson/${course.lessons[0].id}$`), { timeout: 30000 })
    await expect(page.getByRole('heading', { name: 'First Free Practice', exact: true })).toBeVisible({ timeout: 30000 })
    expect(await db.courseEnrollment.count({ where: { userId, courseId, status: 'active', pricePaise: 0 } })).toBe(1)
    expect(await db.payment.count({ where: { userId } })).toBe(0)
    expect(gatewayRequests).toEqual([])
    expect((await page.request.post(`/api/courses/${course.slug}/enroll`)).status()).toBe(409)
    expect(await db.courseEnrollment.count({ where: { userId, courseId } })).toBe(1)
  } finally {
    try {
      if (userId) await db.user.delete({ where: { id: userId } })
      if (courseId) await db.course.delete({ where: { id: courseId } })
    } finally { await db.$disconnect() }
  }
})
