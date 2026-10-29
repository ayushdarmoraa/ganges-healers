import { test, expect } from '@playwright/test'
import { BOOKING_TIME_ZONE, clinicDate, clinicSlotInstant } from '../../src/lib/bookings/time'

test('create, reschedule and cancel a future booking', async ({ page }) => {
  test.setTimeout(120_000)
  const email = `booking-e2e-${Date.now()}@example.test`
  const login = await page.goto(`/api/test/login?role=USER&vip=1&credits=5&email=${encodeURIComponent(email)}`)
  expect(login?.ok()).toBeTruthy()
  const { userId } = await login!.json()
  expect(userId).toBeTruthy()

  // This seeded service has a healer with the matching Yoga specialization.
  await page.goto('/services')
  const service = page.locator('[data-test="service-card"][data-service-slug="yoga-therapy"]')
  await expect(service).toBeVisible({ timeout: 30000 })
  await service.click()
  await expect(page).toHaveURL(/\/services\/yoga-therapy/)
  const bookButton = page.locator('[data-test="healer-card"]').first().locator('[data-test="book-btn"]')
  await expect(bookButton).toBeVisible({ timeout: 20000 })
  const healerId = await bookButton.getAttribute('data-healer-id')
  const serviceId = await bookButton.getAttribute('data-service-id')
  expect(healerId).toBeTruthy()
  expect(serviceId).toBeTruthy()

  let bookingId = ''
  for (let offset = 3; offset <= 10 && !bookingId; offset++) {
    const date = clinicDate(new Date(Date.now() + offset * 86400000))
    const response = await page.request.get(`/api/availability?healerId=${healerId}&date=${date}&serviceId=${serviceId}`)
    expect(response.ok()).toBeTruthy()
    const available = (await response.json()).data.slots as Array<{ time: string; available: boolean }>
    const slot = available.find(s => s.available)
    if (!slot) continue
    const created = await page.request.post('/api/bookings', {
      data: { healerId, serviceId, scheduledAt: clinicSlotInstant(date, slot.time).toISOString() },
    })
    expect(created.status()).toBe(201)
    const body = await created.json()
    expect(body.data.status).toBe('PENDING')
    bookingId = body.data.id
  }
  expect(bookingId).toBeTruthy()

  // Pick a genuinely available future time for this owned booking.
  let targetDate = ''
  let targetTime = ''
  for (let offset = 12; offset <= 22 && !targetDate; offset++) {
    const date = clinicDate(new Date(Date.now() + offset * 86400000))
    const response = await page.request.get(`/api/availability?healerId=${healerId}&date=${date}&bookingId=${bookingId}`)
    expect(response.ok()).toBeTruthy()
    const slot = ((await response.json()).data.slots as Array<{ time: string; available: boolean }>).find(s => s.available)
    if (slot) { targetDate = date; targetTime = slot.time }
  }
  expect(targetDate).toBeTruthy()
  const targetInstant = clinicSlotInstant(targetDate, targetTime)
  const targetLabel = targetInstant.toLocaleTimeString('en-US', { timeZone: BOOKING_TIME_ZONE, hour: 'numeric', minute: '2-digit' })

  await page.goto('/dashboard/bookings')
  const card = page.locator('[data-test="booking-card"]').first()
  await expect(card).toBeVisible({ timeout: 30000 })
  await card.getByRole('button', { name: 'Reschedule' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Select date').fill(targetDate)
  await dialog.getByRole('button', { name: targetLabel, exact: true }).click()
  const rescheduled = page.waitForResponse(r => r.url().endsWith(`/api/bookings/${bookingId}`) && r.request().method() === 'PUT')
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click()
  expect((await rescheduled).status()).toBe(200)
  await expect(card.getByLabel('status RESCHEDULED')).toBeVisible()
  const afterReschedule = await page.request.get(`/api/bookings/${bookingId}`)
  expect((await afterReschedule.json()).data.scheduledAt).toBe(targetInstant.toISOString())

  await card.getByRole('button', { name: 'Cancel' }).click()
  const cancelDialog = page.getByRole('dialog')
  await expect(cancelDialog.getByText(/Refund band/i)).toBeVisible()
  const cancelled = page.waitForResponse(r => r.url().endsWith(`/api/bookings/${bookingId}`) && r.request().method() === 'DELETE')
  await cancelDialog.getByRole('button', { name: 'Confirm cancel' }).click()
  expect((await cancelled).status()).toBe(200)
  await page.getByRole('tab', { name: /Past/ }).click()
  await expect(page.locator('[data-test="booking-card"]').getByLabel('status CANCELLED')).toBeVisible()
  const afterCancel = await page.request.get(`/api/bookings/${bookingId}`)
  expect((await afterCancel.json()).data.status).toBe('CANCELLED')
})
