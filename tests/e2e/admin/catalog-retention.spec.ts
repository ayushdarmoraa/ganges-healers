import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'

test('deactivating a service and healer retains appointments, billing records and purchased program delivery', async ({ page, browser, baseURL }) => {
  test.setTimeout(180000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const suffix = randomUUID(), users: string[] = [], bookingIds: string[] = []
  const serviceName = `Retained service ${suffix}`, healerName = `Retained healer ${suffix}`
  let serviceId = '', healerId = '', programId = '', productId = '', futureId = ''
  const customerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.94' } })
  const customer = await customerContext.newPage()
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.93' })
  try {
    for (const role of ['ADMIN', 'USER', 'HEALER'] as const) users.push((await db.user.create({ data: { email: `retained-${role.toLowerCase()}-${suffix}@example.test`, name: role === 'HEALER' ? healerName : `Retained ${role}`, role } })).id)
    healerId = (await db.healer.create({ data: { userId: users[2], isActive: true, isVerified: true } })).id
    serviceId = (await db.service.create({ data: { name: serviceName, slug: `retained-${suffix}`, category: 'Test', description: 'Isolated retention fixture', price: 10, duration: 60 } })).id
    for (const status of ['CONFIRMED', 'COMPLETED'] as const) {
      const booking = await db.booking.create({ data: { userId: users[1], healerId, serviceId, scheduledAt: new Date(Date.now() + (status === 'CONFIRMED' ? 86400000 : -86400000)), durationMin: 60, pricePaise: 1000, status, payment: { create: { userId: users[1], gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 1000, type: 'SESSION' } } }, include: { payment: true } })
      bookingIds.push(booking.id)
      if (status === 'CONFIRMED') futureId = booking.id
      else {
        await db.review.create({ data: { bookingId: booking.id, userId: users[1], healerId, serviceId, rating: 4, comment: 'Isolated review fixture' } })
        await db.refund.create({ data: { paymentId: booking.payment!.id, amountPaise: 250, status: 'processed', reason: 'Isolated preservation fixture' } })
        await db.invoice.create({ data: { paymentId: booking.payment!.id, invoiceNumber: `CATALOG-${suffix}`, billTo: { name: 'Fixture Customer' }, lineItems: [{ description: 'Session', quantity: 1, amountPaise: 1000 }], subtotalPaise: 1000, taxPaise: 0, totalPaise: 1000, pdfUrl: '' } })
      }
    }
    programId = (await db.program.create({ data: { slug: `retained-program-${suffix}`, title: 'Retained program', description: 'Isolated fixture', totalSessions: 1, sessionsPerWeek: 1, durationMinutes: 60, pricePaise: 3000 } })).id
    const enrollment = await db.programEnrollment.create({ data: { programId, userId: users[1], healerId, assignedHealerId: healerId, pricePaise: 3000, status: 'active', sessions: { create: { healerId, sessionNumber: 1, scheduledAt: new Date(Date.now() + 172800000), durationMin: 60, status: 'SCHEDULED' } } } })
    productId = (await db.product.create({ data: { slug: `retained-product-${suffix}`, title: 'Retained service context', pricePaise: 1000, serviceId } })).id
    const snapshot = async () => ({
      bookings: await db.booking.findMany({ where: { id: { in: bookingIds } }, orderBy: { id: 'asc' } }),
      payments: await db.payment.findMany({ where: { bookingId: { in: bookingIds } }, include: { invoice: true, refunds: true }, orderBy: { id: 'asc' } }),
      reviews: await db.review.findMany({ where: { bookingId: { in: bookingIds } }, orderBy: { id: 'asc' } }),
      program: await db.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id }, include: { sessions: true } }),
      product: await db.product.findUniqueOrThrow({ where: { id: productId } }),
      account: await db.user.findUniqueOrThrow({ where: { id: users[2] } }),
    })
    const before = await snapshot()
    expect((await page.request.get(`/api/test/login?${new URLSearchParams({ role: 'ADMIN', email: `retained-admin-${suffix}@example.test` })}`)).status()).toBe(200)
    await page.goto('/admin/services')
    const service = page.getByRole('article', { name: `Service ${serviceName}`, exact: true })
    await expect(service.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
    await service.getByRole('button', { name: 'Deactivate', exact: true }).click()
    await expect(service.getByText('(Inactive)', { exact: true })).toBeVisible({ timeout: 30000 })
    await page.goto('/admin/healers')
    const healer = page.getByRole('article', { name: `Healer ${healerName}`, exact: true })
    await expect(healer.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0)
    await healer.getByRole('button', { name: 'Deactivate', exact: true }).click()
    await expect(healer.getByText('(Inactive)', { exact: true })).toBeVisible({ timeout: 30000 })
    expect((await db.service.findUniqueOrThrow({ where: { id: serviceId } })).isActive).toBe(false)
    expect((await db.healer.findUniqueOrThrow({ where: { id: healerId } })).isActive).toBe(false)
    expect(await snapshot()).toEqual(before)
    expect((await customer.request.get(`/api/test/login?${new URLSearchParams({ role: 'USER', email: `retained-user-${suffix}@example.test` })}`)).status()).toBe(200)
    await customer.goto('/dashboard/bookings')
    await expect(customer.getByText(serviceName, { exact: true })).toBeVisible({ timeout: 30000 })
    expect((await customer.request.get(`/api/bookings/${futureId}/calendar`)).status()).toBe(200)
  } finally {
    await customerContext.close()
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (productId) await db.product.deleteMany({ where: { id: productId } })
      if (serviceId) await db.service.deleteMany({ where: { id: serviceId } })
      if (programId) await db.program.deleteMany({ where: { id: programId } })
    } finally { await db.$disconnect() }
  }
})

test('service editors retain a duplicate draft and save corrected catalog fields', async ({ page }) => {
  test.setTimeout(120000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const suffix = randomUUID()
  const existingSlug = `existing-service-${suffix}`
  const newSlug = `new-service-${suffix}`
  const email = `catalog-editor-${suffix}@example.test`
  const name = `New service ${suffix}`
  try {
    await db.user.create({ data: { email, name: 'Catalog editor', role: 'ADMIN' } })
    await db.service.create({ data: {
      name: 'Existing catalog service', slug: existingSlug, description: 'Fixture', category: 'Test', price: 20, duration: 60,
    } })
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.95' })
    expect((await page.request.get(`/api/test/login?${new URLSearchParams({ role: 'ADMIN', email })}`)).status()).toBe(200)
    await page.goto('/admin/services')
    const create = page.locator('form').filter({ has: page.getByLabel('Slug', { exact: true }) })
    await create.getByLabel('Name', { exact: true }).fill(name)
    await create.getByLabel('Slug', { exact: true }).fill(existingSlug)
    await create.getByLabel('Category', { exact: true }).fill('Wellness')
    await create.getByLabel('Price (₹)', { exact: true }).fill('0')
    await create.getByLabel('Description', { exact: true }).fill('A service description')
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(create.getByRole('alert')).toHaveText('That URL slug is already in use. Choose another.')
    await expect(create.getByLabel('Name', { exact: true })).toHaveValue(name)
    await create.getByLabel('Slug', { exact: true }).fill(newSlug)
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(create.getByRole('status')).toHaveText('Service created.')
    await expect(create.getByLabel('Name', { exact: true })).toHaveValue('')
    const saved = page.getByRole('article', { name: `Service ${name}`, exact: true })
    await saved.getByText('Edit', { exact: true }).click()
    await saved.getByLabel('Price (₹)', { exact: true }).fill('34.50')
    await saved.getByLabel('Duration (min)', { exact: true }).fill('45')
    await saved.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(saved.getByRole('status')).toHaveText('Service saved.')
    expect(await db.service.findUnique({ where: { slug: newSlug } })).toMatchObject({ price: 34.5, duration: 45 })
  } finally {
    try {
      await db.service.deleteMany({ where: { slug: { in: [existingSlug, newSlug] } } })
      await db.user.deleteMany({ where: { email } })
    } finally { await db.$disconnect() }
  }
})

test('healer and program editors keep rejected drafts and save corrected values', async ({ page }) => {
  test.setTimeout(150000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = randomUUID()
  const adminEmail = `staff-editor-${token}@example.test`
  const healerEmail = `healer-editor-${token}@example.test`
  const healerName = `Healer editor ${token}`
  const duplicateSlug = `existing-program-${token}`
  const programSlug = `new-program-${token}`
  const programTitle = `New program ${token}`
  try {
    await db.user.create({ data: { email: adminEmail, role: 'ADMIN' } })
    const user = await db.user.create({ data: { email: healerEmail, name: healerName, role: 'HEALER' } })
    const healer = await db.healer.create({ data: {
      userId: user.id, bio: 'Saved biography', experienceYears: 2, specializations: ['Meditation'], isVerified: true, isActive: true,
    } })
    await db.program.create({ data: {
      title: 'Existing program', slug: duplicateSlug, description: 'Fixture', totalSessions: 2, sessionsPerWeek: 1, durationMinutes: 60, pricePaise: 1000,
    } })
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.96' })
    expect((await page.request.get(`/api/test/login?${new URLSearchParams({ role: 'ADMIN', email: adminEmail })}`)).status()).toBe(200)

    await page.goto('/admin/healers')
    const profile = page.getByRole('article', { name: `Healer ${healerName}`, exact: true })
    await profile.getByText('Edit', { exact: true }).click()
    await profile.getByLabel('Experience (years)').fill('9')
    await profile.getByLabel('Bio', { exact: true }).fill('')
    const specializations = profile.getByLabel('Specializations (comma-separated)')
    await specializations.fill(Array.from({ length: 21 }, (_, index) => `Specialization ${index}`).join(', '))
    await profile.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(profile.getByRole('alert')).toContainText('up to 20 specializations')
    await expect(profile.getByLabel('Experience (years)')).toHaveValue('9')
    expect(await db.healer.findUnique({ where: { id: healer.id } })).toMatchObject({ bio: 'Saved biography', experienceYears: 2 })
    await specializations.fill('Yoga, Reiki')
    await profile.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(profile.getByRole('status')).toHaveText('Healer profile saved.')
    expect(await db.healer.findUnique({ where: { id: healer.id } })).toMatchObject({
      bio: null, experienceYears: 9, specializations: ['Yoga', 'Reiki'], isVerified: true, isActive: true,
    })

    await page.goto('/admin/programs')
    const create = page.locator('form').filter({ has: page.getByLabel('Slug', { exact: true }) })
    await create.getByLabel('Title', { exact: true }).fill(programTitle)
    await create.getByLabel('Slug', { exact: true }).fill(duplicateSlug)
    await create.getByLabel('Price (paise)', { exact: true }).fill('1500')
    await create.getByLabel('Description', { exact: true }).fill('A drafted program description.')
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(create.getByRole('alert')).toHaveText('That program slug is already in use.')
    await expect(create.getByLabel('Title', { exact: true })).toHaveValue(programTitle)
    await create.getByLabel('Slug', { exact: true }).fill(programSlug)
    await create.getByRole('button', { name: 'Create', exact: true }).click()
    await expect(create.getByRole('status')).toHaveText('Program created.')
    const program = page.getByRole('article', { name: `Program ${programTitle}`, exact: true })
    await program.getByText('Edit', { exact: true }).click()
    const sessions = program.getByLabel('Total Sessions', { exact: true })
    await sessions.fill('367')
    await program.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(program.getByRole('alert')).toContainText('1–366 sessions')
    await expect(sessions).toHaveValue('367')
    await sessions.fill('6')
    await program.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(program.getByRole('status')).toHaveText('Program saved.')
    expect(await db.program.findUnique({ where: { slug: programSlug } })).toMatchObject({ title: programTitle, totalSessions: 6, pricePaise: 1500 })
  } finally {
    try {
      await db.program.deleteMany({ where: { slug: { in: [duplicateSlug, programSlug] } } })
      await db.user.deleteMany({ where: { email: { in: [adminEmail, healerEmail] } } })
    } finally { await db.$disconnect() }
  }
})
