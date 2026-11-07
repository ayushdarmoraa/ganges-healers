import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('an admin authors and publishes a course, a student learns, and archiving preserves purchased access', async ({ page, browser, baseURL }) => {
  test.setTimeout(240000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const suffix = randomUUID(), title = `Authoring Course ${suffix}`, slug = `authoring-${suffix}`
  const users: string[] = []; let courseId = ''
  const customerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.71' } })
  const customer = await customerContext.newPage()
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.70' })
  try {
    for (const role of ['ADMIN', 'USER'] as const) {
      const email = `authoring-${role.toLowerCase()}-${suffix}@example.test`
      users.push((await db.user.create({ data: { email, role } })).id)
      const target = role === 'ADMIN' ? page : customer
      expect((await target.request.get(`/api/test/login?${new URLSearchParams({ role, email })}`)).status()).toBe(200)
    }
    await page.goto('/admin/courses')
    await page.getByRole('button', { name: 'New course', exact: true }).click()
    const create = page.getByRole('region', { name: 'New course draft' })
    await create.getByLabel('Course title', { exact: true }).fill(title)
    await create.getByLabel('Course description', { exact: true }).fill('An isolated authoring and access verification course.')
    await create.getByLabel('URL slug', { exact: true }).fill(slug)
    await create.getByRole('button', { name: 'Create draft', exact: true }).click()
    const editor = page.getByRole('region', { name: 'Course editor' })
    await expect(editor.getByRole('heading', { name: `Edit ${title}`, exact: true })).toBeVisible({ timeout: 30000 })
    const saved = await db.course.findUniqueOrThrow({ where: { slug } }); courseId = saved.id
    expect(saved.isActive).toBe(false)
    expect((await customer.request.get(`/api/courses/${slug}`)).status()).toBe(404)
    const add = editor.getByRole('form', { name: 'New lesson' })
    await add.getByLabel('Lesson title', { exact: true }).fill('A private practice lesson')
    await add.getByLabel('Lesson text', { exact: true }).fill('Private text for this isolated browser course.')
    await add.getByRole('button', { name: 'Add lesson', exact: true }).click()
    await expect(editor.getByRole('article', { name: 'Lesson 1: A private practice lesson', exact: true })).toBeVisible({ timeout: 30000 })
    await editor.getByRole('button', { name: 'Publish course', exact: true }).click()
    await expect(editor.getByRole('button', { name: 'Archive course', exact: true })).toBeEnabled({ timeout: 30000 })
    const publicCourse = await (await customer.request.get(`/api/courses/${slug}`)).json()
    expect(JSON.stringify(publicCourse)).not.toContain('Private text for this isolated browser course.')
    const lessonId = publicCourse.lessons[0].id
    expect((await customer.request.get('/api/admin/courses')).status()).toBe(403)
    await customer.goto(`/courses/${slug}`)
    await customer.getByRole('button', { name: 'Enroll for free', exact: true }).click()
    await expect(customer.getByRole('heading', { name: 'A private practice lesson', exact: true })).toBeVisible({ timeout: 30000 })
    await expect(customer.getByText('Private text for this isolated browser course.', { exact: true })).toBeVisible()
    await customer.getByRole('button', { name: 'Mark Complete & Continue', exact: true }).click()
    await expect(customer.getByRole('button', { name: 'Course Complete ✓', exact: true })).toBeVisible({ timeout: 30000 })
    await editor.getByRole('button', { name: 'Archive course', exact: true }).click()
    await expect(editor.getByText(/Enrollment records protect this curriculum/)).toBeVisible({ timeout: 30000 })
    expect((await customer.request.get(`/api/courses/${slug}`)).status()).toBe(200)
    expect((await customer.request.get(`/api/courses/${slug}/lessons/${lessonId}`)).status()).toBe(200)
    await customer.goto(`/courses/${slug}`)
    await expect(customer.getByText('This course is archived. Your existing lesson access is preserved.', { exact: true })).toBeVisible({ timeout: 30000 })
    await customer.getByRole('button', { name: 'Continue Learning', exact: true }).click()
    await expect(customer.getByRole('heading', { name: 'A private practice lesson', exact: true })).toBeVisible({ timeout: 30000 })
    expect(await db.courseEnrollment.findUniqueOrThrow({ where: { userId_courseId: { userId: users[1], courseId } } })).toMatchObject({ status: 'completed', progress: 1, pricePaise: 0 })
    expect(await db.payment.count({ where: { userId: { in: users } } })).toBe(0)
  } finally {
    await customerContext.close()
    try {
      if (!courseId) courseId = (await db.course.findUnique({ where: { slug } }))?.id ?? ''
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (courseId) await db.course.delete({ where: { id: courseId } })
    } finally { await db.$disconnect() }
  }
})
