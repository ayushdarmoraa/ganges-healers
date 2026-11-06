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
