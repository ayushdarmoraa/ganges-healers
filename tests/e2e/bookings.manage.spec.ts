import { test, expect } from '@playwright/test'

test.describe('Manage bookings', () => {
  test('reschedule and cancel a future booking', async ({ page }) => {
    test.setTimeout(120_000)

  // Programmatic login for e2e (sets NextAuth cookies) with VIP credits to prefer credits flow
    const loginRes = await page.goto('/api/test/login?role=USER&vip=1&credits=5')
    // Try to parse userId from JSON body
    let testUserId: string | null = null
    try {
      const json = await loginRes?.json()
      if (json?.userId) testUserId = json.userId as string
    } catch {}

    // Navigate to Services and open first service detail (robust pattern like smoke)
    await page.goto('/services')
    const cards = page.locator('[data-test="service-card"]')
    try {
      await expect(cards.first()).toBeVisible({ timeout: 30000 })
    } catch {
      await page.reload()
      await expect(cards.first()).toBeVisible({ timeout: 30000 })
    }
    const first = cards.first()
    const slugAttr = await first.getAttribute('data-service-slug')
    await first.click()
    try {
      await page.waitForLoadState('networkidle')
      await expect(page).toHaveURL(/\/services\/.+/, { timeout: 30000 })
    } catch (navErr) {
      // If navigation fails due to server runtime error, try direct goto using slug
      const bodyText = await page.locator('body').innerText().catch(() => '')
      if (bodyText.includes('Unexpected end of JSON input') || bodyText.includes('Error:')) {
        console.log('Detected server error on service page, retrying via direct navigation')
      }
      if (slugAttr) {
        await page.goto(`/services/${slugAttr}`)
        await page.waitForLoadState('networkidle')
        await expect(page).toHaveURL(new RegExp(`/services/${slugAttr}`), { timeout: 30000 })
      } else {
        throw new Error('Navigation to service detail failed and slug missing: ' + String(navErr))
      }
    }

    // Click Book on a healer card
    const healerCard = page.locator('[data-test="healer-card"]').first()
    await expect(healerCard).toBeVisible({ timeout: 20000 })
    const bookBtn = healerCard.locator('[data-test="book-btn"]')
    await expect(bookBtn).toBeVisible()
    const healerId = await bookBtn.getAttribute('data-healer-id')
    const serviceId = await bookBtn.getAttribute('data-service-id')
    expect(healerId).toBeTruthy()
    expect(serviceId).toBeTruthy()

  // Create a booking directly via API for a valid upcoming slot using availability API
  let createdOk = false
  let canonicalBookingId: string | null = null
  let canonicalBookingData: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
    for (let offset = 2; offset <= 10; offset++) {
      const d = new Date(); d.setDate(d.getDate() + offset)
      const y = d.getFullYear(); const m = `${d.getMonth()+1}`.padStart(2,'0'); const dd = `${d.getDate()}`.padStart(2,'0')
      const dateStr = `${y}-${m}-${dd}`
      const availResp = await page.request.get(`/api/availability?healerId=${healerId}&date=${dateStr}&serviceId=${serviceId}`)
      if (!availResp.ok()) continue
      const avail = await availResp.json()
      const first = (avail?.data?.slots || []).find((s: any) => s.available) // eslint-disable-line @typescript-eslint/no-explicit-any
      if (!first) continue
      const scheduledAt = new Date(`${dateStr}T${first.time}:00+05:30`).toISOString()
      const createResp = await page.request.post('/api/bookings', { data: { healerId, serviceId, scheduledAt }, headers: testUserId ? { 'x-test-user-id': testUserId } : {} })
      if (createResp.ok()) {
        createdOk = true
        try {
          const body = await createResp.json().catch(() => null)
          canonicalBookingId = body?.data?.id ?? body?.booking?.id ?? body?.id ?? null
          if (canonicalBookingId == null) canonicalBookingId = null
        } catch { /* noop */ }
        break
      }
    }
    expect(createdOk).toBeTruthy()

    // Ensure server-side canonical confirmation of booking exists (TEST_MODE-friendly)
    if (process.env.TEST_MODE === '1') {
      // Primary: try window hook (5s)
      try {
        await page.waitForFunction(() => {
          const w = window as unknown as { __e2eBookingId?: string }
          return !!w.__e2eBookingId
        }, null, { timeout: 5000 })
        canonicalBookingId = (await page.evaluate(() => {
          const w = window as unknown as { __e2eBookingId?: string }
          return w.__e2eBookingId
        })) ?? null
      } catch {
        // Fallback: poll GET /api/test/last-booking every 500ms up to 30s
        let lastBody: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
        const start = Date.now()
        while (Date.now() - start < 30000) {
          const resp = await page.request.get('/api/test/last-booking')
          if (resp.status() === 404) {
            throw new Error('GET /api/test/last-booking returned 404 — TEST_MODE may not be active. Run `pnpm run dev:test` which sets TEST_MODE=1')
          }
          try {
            lastBody = await resp.json().catch(() => null)
          } catch { lastBody = null }
          if (lastBody && lastBody.success && Array.isArray(lastBody.data) && lastBody.data.length > 0) {
            canonicalBookingData = lastBody.data[0]
            canonicalBookingId = canonicalBookingData.id
            break
          }
          await page.waitForTimeout(500)
        }
        if (!canonicalBookingId) {
          console.log('Last booking endpoint response (final):', JSON.stringify(lastBody))
          throw new Error('No booking found via window hook or /api/test/last-booking fallback')
        }
      }
    } else {
      // The test runner process may not have TEST_MODE set; try polling the test endpoint directly as a fallback.
      let lastBody: any = null // eslint-disable-line @typescript-eslint/no-explicit-any
      const start = Date.now()
      while (Date.now() - start < 30000) {
        const resp = await page.request.get('/api/test/last-booking')
        if (resp.status() === 404) {
          throw new Error('GET /api/test/last-booking returned 404 — TEST_MODE may not be active on the server. Start the test server with `pnpm run dev:test` which sets TEST_MODE=1')
        }
        try {
          lastBody = await resp.json().catch(() => null)
        } catch { lastBody = null }
        if (lastBody && lastBody.success && Array.isArray(lastBody.data) && lastBody.data.length > 0) {
          canonicalBookingData = lastBody.data[0]
          canonicalBookingId = canonicalBookingData.id
          break
        }
        await page.waitForTimeout(500)
      }
      if (!canonicalBookingId) {
        console.log('Last booking endpoint response (final):', JSON.stringify(lastBody))
        throw new Error('No booking found via /api/test/last-booking fallback; ensure TEST_MODE=1 and the server is seeded (run `pnpm run dev:test`)')
      }
    }

    // If we didn't capture full booking data from endpoint, try to fetch it now
    if (!canonicalBookingData && canonicalBookingId) {
      const fetchResp = await page.request.get('/api/test/last-booking')
      if (fetchResp.ok()) {
        try {
          const jb = await fetchResp.json().catch(() => null)
          if (jb?.success && Array.isArray(jb.data) && jb.data.length > 0) canonicalBookingData = jb.data[0]
        } catch { /* noop */ }
      }
    }

    // Go to dashboard bookings (fallback source of truth)
    await page.goto('/dashboard/bookings')
    // Wait for dashboard to show upcoming bookings; allow extra time
    await expect(page.getByText(/Upcoming/)).toBeVisible({ timeout: 45000 })
    // Wait for at least one booking to appear; if not, poll API briefly and reload once
    const bookingCards = page.locator('[data-test="booking-card"]')
    try {
      await expect(bookingCards.first()).toBeVisible({ timeout: 30000 })
    } catch {
      // Poll API to ensure booking is persisted, then reload
      for (let i = 0; i < 12; i++) {
        const resp = await page.request.get('/api/bookings')
        if (resp.ok()) {
          const data = await resp.json()
          if (Array.isArray(data) && data.length > 0) break
        }
        await page.waitForTimeout(1000)
      }
      await page.reload()
      await expect(bookingCards.first()).toBeVisible({ timeout: 30000 })
    }

    // Open Reschedule within the first booking card
    const firstCard = bookingCards.first()
    await expect(firstCard).toBeVisible()
    await firstCard.getByRole('button', { name: 'Reschedule' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    // Pick a different time (same date)
    // Use structure-based selector: pick first enabled button that is not Confirm/Cancel
    const timeButtons = dialog
      .locator('button')
      .filter({ hasNotText: /Confirm|Cancel/i })
      .filter({ has: page.locator(':not([disabled])') })

    await timeButtons.first().click()
    const confirm2 = dialog.getByRole('button', { name: /Confirm/ })
    await confirm2.click()

    // Cancel
    await firstCard.getByRole('button', { name: 'Cancel' }).click()
    const cancelDialog = page.getByRole('dialog')
    await expect(cancelDialog.getByText(/Refund band/i)).toBeVisible()
    const confirmCancel = cancelDialog.getByRole('button', { name: /Confirm cancel/i })
    await confirmCancel.click()
    await expect(page.getByText(/CANCELLED/i)).toBeVisible()
  })
})
