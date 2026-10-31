import { test, expect, type Request, type Response } from '@playwright/test'
import { BOOKING_TIME_ZONE, clinicDate, clinicSlotInstant } from '../../src/lib/bookings/time'

test('create, reschedule and cancel a future booking', async ({ page }, testInfo) => {
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
  await expect(page).toHaveURL(/\/services\/yoga-therapy/, { timeout: 30000 })
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

  const card = page.locator('[data-test="booking-card"]').first()
  const loadEvents: Array<Record<string, unknown>> = []
  let failureView: unknown
  const record = (event: Record<string, unknown>) => { if (loadEvents.length < 50) loadEvents.push(event) }
  const object = (value: unknown) => value && typeof value === 'object' ? value as Record<string, unknown> : undefined
  const safeMessage = (message: string) => message.split('\n')[0]
    .replace(/(?:https?|postgres(?:ql)?):\/\/\S+/gi, '[url]')
    .replace(/\b[^\s@]+@[^\s@]+\b/g, '[email]')
    .replace(/\b(cookie|authorization|password|secret|token)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .slice(0, 240)
  const observedPath = (request: Request) => {
    const path = new URL(request.url()).pathname
    return request.method() === 'GET' && ['/api/bookings', '/api/auth/session'].includes(path) ? path : null
  }
  const onRequest = (request: Request) => {
    const path = observedPath(request)
    if (path) record({ event: 'request', path })
  }
  const onRequestFailed = (request: Request) => {
    const path = observedPath(request)
    if (path) record({ event: 'requestfailed', path, message: safeMessage(request.failure()?.errorText || 'Unknown network error') })
  }
  const onPageError = (error: Error) => record({ event: 'pageerror', message: safeMessage(error.message) })
  const onResponse = (response: Response) => {
    const path = observedPath(response.request())
    if (!path) return
    const event: Record<string, unknown> = { event: 'response', path, status: response.status(), bodyPending: true }
    record(event)
    void response.json().then((body: unknown) => {
      event.bodyPending = false
      if (path === '/api/auth/session') {
        event.sessionUserMatchesExpected = object(object(body)?.user)?.id === userId
        return
      }
      const data = object(body)?.data
      const row = Array.isArray(data) ? data.map(object).find(item => item?.id === bookingId) : undefined
      const scheduledAt = typeof row?.scheduledAt === 'string' ? Date.parse(row.scheduledAt) : NaN
      Object.assign(event, {
        dataIsArray: Array.isArray(data), count: Array.isArray(data) ? data.length : null,
        createdBookingPresent: !!row, ownerMatchesExpected: row ? row.userId === userId : null,
        validDate: row ? Number.isFinite(scheduledAt) : null, futureDate: row ? scheduledAt > Date.now() : null,
      })
    }).catch(() => { event.bodyPending = false; event.bodyUnreadable = true })
  }
  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfailed', onRequestFailed)
  page.on('pageerror', onPageError)
  try {
    await page.goto('/dashboard/bookings')
    await expect(card).toBeVisible({ timeout: 30000 })
  } catch (error) {
    failureView = await page.evaluate(() => {
      const main = document.querySelector('main')
      const text = main?.textContent || ''
      return {
        path: location.pathname, loading: text.includes('Loading...'),
        error: !!main?.querySelector('.text-red-600'), noUpcoming: text.includes('No upcoming bookings.'),
        cardCount: main?.querySelectorAll('[data-test="booking-card"]').length || 0,
      }
    }).catch(() => ({ unavailable: true }))
    throw error
  } finally {
    page.off('request', onRequest)
    page.off('response', onResponse)
    page.off('requestfailed', onRequestFailed)
    page.off('pageerror', onPageError)
    try {
      const body = JSON.stringify({ events: loadEvents, failureView })
      console.info(`[booking-load] ${body}`)
      await testInfo.attach('booking-load', { body, contentType: 'application/json' })
    } catch { /* Diagnostics must preserve the original assertion result. */ }
  }
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
  const cancelDialog = page.getByRole('dialog', { name: 'Cancel booking' })
  await expect(cancelDialog.getByText(/Refund eligibility is calculated from your saved booking and payment/i)).toBeVisible()
  await expect(cancelDialog.getByText(/Unpaid and credit bookings do not receive a cash refund/i)).toBeVisible()
  const cancelled = page.waitForResponse(r => r.url().endsWith(`/api/bookings/${bookingId}`) && r.request().method() === 'DELETE')
  await cancelDialog.getByRole('button', { name: 'Confirm cancel' }).click()
  const cancelResponse = await cancelled
  expect(cancelResponse.status()).toBe(200)
  const cancelResult = await cancelResponse.json()
  expect(cancelResult.data).toMatchObject({ id: bookingId, status: 'CANCELLED' })
  // This booking was never paid, so the policy band does not imply a cash refund.
  expect(cancelResult.refund).toMatchObject({
    band: 'FULL',
    refundPaise: 0,
    status: 'NOT_REQUIRED',
    message: 'Booking cancelled. No cash refund is due for this booking.',
  })
  await expect(page.getByText(cancelResult.refund.message, { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: /Past/ }).click()
  await expect(page.locator('[data-test="booking-card"]').getByLabel('status CANCELLED')).toBeVisible()
  const afterCancel = await page.request.get(`/api/bookings/${bookingId}`)
  expect(afterCancel.ok()).toBeTruthy()
  expect((await afterCancel.json()).data).toMatchObject({ id: bookingId, status: 'CANCELLED', payment: null })
})
