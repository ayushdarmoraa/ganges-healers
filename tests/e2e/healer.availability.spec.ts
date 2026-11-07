import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { clinicDate, clinicSlotInstant } from '../../src/lib/bookings/time'

test('a healer publishes early hours, stale edits cannot overwrite them, and a customer books the advertised time', async ({ page, browser, baseURL }) => {
  test.setTimeout(240000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.40' })
  const suffix = randomUUID(), users: string[] = []
  const staffEmail = `hours-staff-${suffix}@example.test`, customerEmail = `hours-customer-${suffix}@example.test`
  let healerId = '', serviceId = ''
  let staleContext: Awaited<ReturnType<typeof browser.newContext>> | undefined
  const login = async (role: string, email: string) => expect((await page.request.get(`/api/test/login?${new URLSearchParams({ role, email })}`)).status()).toBe(200)
  try {
    const staff = await db.user.create({ data: { email: staffEmail, role: 'HEALER', name: 'Availability Practitioner' } }); users.push(staff.id)
    const customer = await db.user.create({ data: { email: customerEmail, name: 'Availability Customer', vip: true, freeSessionCredits: 1 } }); users.push(customer.id)
    const service = await db.service.create({ data: { slug: `availability-journey-${suffix}`, name: `Availability Journey ${suffix}`, category: 'Test', description: 'Isolated browser fixture', price: 100, duration: 60 } }); serviceId = service.id
    const healer = await db.healer.create({ data: { userId: staff.id, isActive: true, specializations: [service.name], availability: { monday: { start: '10:00', end: '20:00' } } } }); healerId = healer.id
    await login('HEALER', staffEmail); await page.goto('/healer/availability')
    await expect(page.getByLabel('Monday start', { exact: true })).toHaveValue('10:00', { timeout: 30000 })
    await page.getByLabel('Monday start', { exact: true }).selectOption('08:00')
    await page.getByLabel('Monday end', { exact: true }).selectOption('12:00')
    let saved = page.waitForResponse(response => response.url().endsWith('/api/healer/availability') && response.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Save Availability', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await expect(page.getByText('Availability saved', { exact: true })).toBeVisible()
    staleContext = await browser.newContext({ baseURL, storageState: await page.context().storageState(), extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.41' } })
    const stale = await staleContext.newPage(); await stale.goto('/healer/availability')
    await expect(stale.getByLabel('Monday end', { exact: true })).toHaveValue('12:00', { timeout: 30000 })
    await page.getByLabel('Monday end', { exact: true }).selectOption('14:00')
    saved = page.waitForResponse(response => response.url().endsWith('/api/healer/availability') && response.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Save Availability', exact: true }).click(); expect((await saved).status()).toBe(200)
    await stale.getByLabel('Monday end', { exact: true }).selectOption('16:00')
    const conflict = stale.waitForResponse(response => response.url().endsWith('/api/healer/availability') && response.request().method() === 'PUT')
    await stale.getByRole('button', { name: 'Save Availability', exact: true }).click(); expect((await conflict).status()).toBe(412)
    await expect(stale.getByRole('alert').filter({ hasText: 'another session' })).toContainText('another session')
    await expect(stale.getByLabel('Monday end', { exact: true })).toHaveValue('16:00')
    await stale.getByRole('button', { name: 'Reload saved hours', exact: true }).click()
    await expect(stale.getByLabel('Monday end', { exact: true })).toHaveValue('14:00', { timeout: 30000 })
    await staleContext.close(); staleContext = undefined

    let date = ''
    for (let offset = 8; offset < 16; offset++) {
      const candidate = clinicDate(new Date(Date.now() + offset * 86400000))
      if (new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(clinicSlotInstant(candidate, '12:00')) === 'Monday') { date = candidate; break }
    }
    expect(date).toBeTruthy()
    const availabilityUrl = `/api/availability?${new URLSearchParams({ healerId, serviceId, date })}`
    const slots = (await (await page.request.get(availabilityUrl)).json()).data.slots as Array<{ time: string; available: boolean }>
    expect(slots.find(slot => slot.time === '08:00')?.available).toBe(true)
    expect(slots.find(slot => slot.time === '13:30')?.available).toBe(false)
    await login('USER', customerEmail)
    expect((await page.request.get('/api/healer/availability')).status()).toBe(403)
    await page.goto(`/services/${service.slug}?${new URLSearchParams({ openBooking: '1', healerId })}`)
    const dialog = page.getByRole('dialog', { name: `Book ${service.name}`, exact: true })
    await dialog.getByLabel('Select Date', { exact: true }).fill(date)
    await dialog.getByRole('button', { name: '8:00 AM', exact: true }).click()
    const created = page.waitForResponse(response => response.url().endsWith('/api/bookings') && response.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Confirm & Pay', exact: true }).click()
    const createdResponse = await created; expect(createdResponse.status()).toBe(201)
    const bookingId = (await createdResponse.json()).data.id as string
    await expect(dialog.getByRole('heading', { name: 'Booking Confirmed!', exact: true })).toBeVisible({ timeout: 30000 })
    expect(await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).toMatchObject({ userId: customer.id, healerId, status: 'CONFIRMED', durationMin: 60, scheduledAt: clinicSlotInstant(date, '08:00') })
    const after = (await (await page.request.get(availabilityUrl)).json()).data.slots as Array<{ time: string; available: boolean }>
    expect(after.find(slot => slot.time === '08:00')?.available).toBe(false)
    await login('HEALER', staffEmail); await page.goto('/healer/availability')
    await expect(page.getByLabel('Monday start', { exact: true })).toHaveValue('08:00', { timeout: 30000 })
    await page.getByRole('switch', { name: 'Monday availability', exact: true }).click()
    saved = page.waitForResponse(response => response.url().endsWith('/api/healer/availability') && response.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Save Availability', exact: true }).click(); expect((await saved).status()).toBe(200)
    expect((await (await page.request.get(availabilityUrl)).json()).data.slots).toEqual([])
    expect((await db.booking.findUniqueOrThrow({ where: { id: bookingId } })).status).toBe('CONFIRMED')
  } finally {
    await staleContext?.close()
    try {
      if (healerId) { await db.payment.deleteMany({ where: { booking: { healerId } } }); await db.booking.deleteMany({ where: { healerId } }) }
      if (serviceId) await db.service.delete({ where: { id: serviceId } })
      await db.user.deleteMany({ where: { id: { in: users } } })
    } finally { await db.$disconnect() }
  }
})
