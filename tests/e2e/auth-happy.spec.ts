import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { passwordVersion } from '../../src/lib/auth/password-version'

test('register without a phone, sign in with the stored password, and sign out', async ({ page, baseURL }) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const email = `signup-${crypto.randomUUID()}@example.test`
  const password = `Test-${crypto.randomUUID()}!`
  try {
    await page.goto('/register')
    await page.getByLabel('Full Name', { exact: true }).fill('Signup Verification')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create Account', exact: true }).click()
    await expect(page).toHaveURL(/\/auth\/signin$/, { timeout: 30_000 })

    const registered = await db.user.findUniqueOrThrow({ where: { email } })
    expect(registered.phone).toBeNull()
    expect(registered.role).toBe('USER')
    expect(registered.password).not.toBe(password)
    expect(registered.password).toMatch(/^\$2/)

    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(`${password}-incorrect`)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.getByText('Invalid credentials', { exact: true })).toBeVisible({ timeout: 30_000 })
    expect(await (await page.request.get('/api/auth/session')).json()).toBeNull()
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('')
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
    await expect(page.getByText('Invalid credentials', { exact: true })).toHaveCount(0, { timeout: 15000 })
    await expect(page.getByRole('form', { name: 'Sign in' }).getByRole('alert')).toContainText('Check your Ganges Healers email')

    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'My Bookings', exact: true })).toBeVisible()
    const session = await (await page.request.get('/api/auth/session')).json()
    expect(session.user.id).toBe(registered.id)
    expect(session.user.role).toBe('USER')
    expect((await page.context().cookies()).some(cookie => cookie.name === 'test-admin')).toBe(false)

    await page.getByRole('button', { name: 'Open user menu', exact: true }).click()
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page).toHaveURL(new URL('/', baseURL).href, { timeout: 30_000 })
    expect(await (await page.request.get('/api/auth/session')).json()).toBeNull()
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/auth\/signin$/)
  } finally {
    try {
      await db.user.deleteMany({ where: { email } })
    } finally {
      await db.$disconnect()
    }
  }
})

test('a profile-selected practitioner survives registration and real password sign-in', async ({ page, baseURL }) => {
  test.setTimeout(120000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = crypto.randomUUID()
  const email = `booking-return-${token}@example.test`
  const password = `Test-${crypto.randomUUID()}!`
  const practitionerUsers: string[] = []
  let serviceId = ''
  try {
    const service = await db.service.create({ data: { slug: `targeted-${token}`, name: `Targeted ${token}`, description: 'A practitioner selection test.', category: 'Test', price: 100, duration: 60 } })
    serviceId = service.id
    const healers = []
    for (const [name, experienceYears] of [['First Ranked Practitioner', 20], ['Chosen Practitioner', 5]] as const) {
      const user = await db.user.create({ data: { email: `practitioner-${experienceYears}-${token}@example.test`, name, role: 'HEALER' } })
      practitionerUsers.push(user.id)
      healers.push(await db.healer.create({ data: { userId: user.id, specializations: [service.name], experienceYears } }))
    }
    const selected = healers[1]
    await page.goto(`/healers/${selected.id}`)
    await page.getByRole('link', { name: 'Book a session', exact: true }).click()
    await expect(page).toHaveURL(new URL(`/services/${service.slug}?${new URLSearchParams({ openBooking: '1', healerId: selected.id })}`, baseURL).href, { timeout: 30000 })
    const destination = new URL(page.url())
    expect(destination.searchParams.get('healerId')).toBe(selected.id)
    const dialog = page.getByRole('dialog', { name: `Book ${service.name}`, exact: true })
    await expect(dialog.getByText('Chosen Practitioner', { exact: true })).toBeVisible({ timeout: 30000 })
    await expect(dialog.getByText('First Ranked Practitioner', { exact: true })).toHaveCount(0)
    const callbackUrl = `${destination.pathname}${destination.search}`
    // The test server intentionally bypasses booking sign-in in TEST_MODE. Exercise the real auth journey directly;
    // the signed-out modal redirect is separately covered with both test flags disabled in the component suite.
    await page.goto(`/auth/signin?${new URLSearchParams({ callbackUrl })}`)
    await page.getByRole('link', { name: 'Create one', exact: true }).click()
    await expect(page).toHaveURL(/\/register\?callbackUrl=/, { timeout: 30000 })
    expect(new URL(page.url()).searchParams.get('callbackUrl')).toBe(callbackUrl)
    await page.getByLabel('Full Name', { exact: true }).fill('Booking Return Customer')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByLabel('Confirm Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Create Account', exact: true }).click()
    await expect(page).toHaveURL(/\/auth\/signin\?callbackUrl=/, { timeout: 30000 })
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(new URL(callbackUrl, baseURL).href, { timeout: 30000 })
    await expect(dialog.getByText('Chosen Practitioner', { exact: true })).toBeVisible()
    const registered = await db.user.findUniqueOrThrow({ where: { email } })
    expect((await (await page.request.get('/api/auth/session')).json()).user.id).toBe(registered.id)
    destination.searchParams.set('healerId', 'unavailable-practitioner')
    await page.goto(`${destination.pathname}${destination.search}`)
    await expect(page.getByRole('alert')).toContainText('The selected healer is unavailable for this service')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally {
    try {
      await db.user.deleteMany({ where: { OR: [{ email }, { id: { in: practitionerUsers } }] } })
      if (serviceId) await db.service.delete({ where: { id: serviceId } })
    } finally { await db.$disconnect() }
  }
})

test('a single-use recovery link changes the real password, revokes old sessions, and keeps the booking return', async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const email = `recovery-${crypto.randomUUID()}@example.test`
  const oldPassword = `Old-${crypto.randomUUID()}!`
  const newPassword = `New-${crypto.randomUUID()}!`
  const stored = await bcrypt.hash(oldPassword, 4)
  const user = await db.user.create({ data: { email, password: stored } })
  const recovery = crypto.randomBytes(32).toString('hex')
  const hash = crypto.createHash('sha256').update(recovery).digest('hex')
  const callback = '/services?search=Yoga'
  let oldSession: Awaited<ReturnType<typeof browser.newContext>> | undefined
  try {
    await page.goto('/auth/signin')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(oldPassword)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
    oldSession = await browser.newContext({ baseURL, storageState: await page.context().storageState() })
    expect((await (await oldSession.request.get('/api/auth/session')).json()).user.id).toBe(user.id)
    // Isolated fixture represents the emailed fragment; no external email or real account is used.
    await db.verificationToken.create({ data: { token: hash, identifier: `password-reset:${user.id}:${passwordVersion(stored)}:${crypto.createHash('sha256').update(email.toLowerCase()).digest('hex')}`, expires: new Date(Date.now() + 15 * 60_000) } })
    await page.goto(`/auth/reset-password?${new URLSearchParams({ callbackUrl: callback })}#token=${recovery}`)
    await expect(page.getByLabel('New password', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page).not.toHaveURL(/#token=/)
    await page.getByLabel('New password', { exact: true }).fill(newPassword)
    await page.getByLabel('Confirm new password', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Update password', exact: true }).click()
    await expect(page.getByText('Password updated', { exact: true })).toBeVisible({ timeout: 30_000 })
    expect(await db.verificationToken.findUnique({ where: { token: hash } })).toBeNull()
    expect(await (await oldSession.request.get('/api/auth/session')).json()).toBeNull()
    expect((await oldSession.request.get('/api/notifications')).status()).toBe(401)
    const replay = await page.request.post('/api/auth/password-reset/confirm', { data: { token: recovery, newPassword: oldPassword } })
    expect(replay.status()).toBe(400)
    await page.getByRole('link', { name: 'Sign in with your new password' }).click()
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(oldPassword)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.getByText('Invalid credentials', { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByLabel('Password', { exact: true }).fill(newPassword)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(new URL(callback, baseURL).href, { timeout: 30_000 })
  } finally {
    await oldSession?.close()
    try {
      await db.verificationToken.deleteMany({ where: { identifier: { startsWith: `password-reset:${user.id}:` } } })
      await db.user.delete({ where: { id: user.id } })
    } finally { await db.$disconnect() }
  }
})

test('a verification link confirms the actual account email once without consuming it on page load or changing sign-in', async ({ page }) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const email = `email-verification-${crypto.randomUUID()}@example.test`
  const password = `Test-${crypto.randomUUID()}!`
  const stored = await bcrypt.hash(password, 4)
  const user = await db.user.create({ data: { email, password: stored } })
  const token = crypto.randomBytes(32).toString('hex')
  const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex')
  try {
    await page.goto('/auth/signin')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
    await page.goto('/dashboard/settings')
    await expect(page.getByRole('button', { name: 'Send verification link', exact: true })).toBeVisible({ timeout: 30_000 })
    const status = await (await page.request.get('/api/users/me/email-verification')).json()
    expect(status).toEqual({ ownerId: user.id, email, verifiedAt: null })
    // A synthetic isolated email fixture exercises the real browser/API/database path without sending mail.
    await db.verificationToken.create({ data: { token: hash(token), identifier: `email-verification:${user.id}:${hash(email)}:${user.securityVersion}`, expires: new Date(Date.now() + 600_000) } })
    await page.goto(`/auth/verify-email#token=${token}`)
    await expect(page.getByRole('button', { name: 'Verify email', exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page).not.toHaveURL(/#token=/)
    expect(await db.verificationToken.findUnique({ where: { token: hash(token) } })).not.toBeNull()
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBeNull()
    await page.getByRole('button', { name: 'Verify email', exact: true }).click()
    await expect(page.getByText('Email verified', { exact: true })).toBeVisible({ timeout: 30_000 })
    const verified = await db.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(verified.emailVerified).not.toBeNull()
    expect(verified).toMatchObject({ password: stored, securityVersion: user.securityVersion, role: 'USER' })
    const replay = await page.request.post('/api/auth/email-verification/confirm', { data: { token } })
    expect(replay.status()).toBe(400)
    expect(replay.headers()['set-cookie']).toBeUndefined()
    await page.getByRole('link', { name: 'Return to account settings', exact: true }).click()
    await expect(page.getByText('Email verified.', { exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Send verification link', exact: true })).toHaveCount(0)
    expect((await (await page.request.get('/api/auth/session')).json()).user.id).toBe(user.id)
  } finally {
    try {
      await db.verificationToken.deleteMany({ where: { OR: [{ identifier: { startsWith: `email-verification:${user.id}:` } }, { identifier: `email-verification-rate:${user.id}` }] } })
      await db.user.delete({ where: { id: user.id } })
    } finally { await db.$disconnect() }
  }
})

test('profile edits retain failed drafts, reject stale tabs, reload explicitly and save the actual owned account', async ({ page }) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const email = `profile-edit-${crypto.randomUUID()}@example.test`, password = `Test-${crypto.randomUUID()}!`
  const stored = await bcrypt.hash(password, 4)
  const user = await db.user.create({ data: { email, name: 'Original profile', password: stored, freeSessionCredits: 3 } })
  try {
    await page.goto('/auth/signin')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
    await page.goto('/dashboard/settings')
    const form = page.getByRole('form', { name: 'Edit profile', exact: true })
    await expect(form.getByLabel('Full Name', { exact: true })).toHaveValue('Original profile', { timeout: 30_000 })
    await form.getByLabel('Full Name', { exact: true }).fill('Saved profile')
    await page.route('**/api/users/me', route => route.request().method() === 'PATCH' ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary test outage. Try again.' }) }) : route.continue())
    await form.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(form.getByRole('alert')).toContainText('Temporary test outage')
    await expect(form.getByLabel('Full Name', { exact: true })).toHaveValue('Saved profile')
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('Original profile')
    await page.unroute('**/api/users/me')
    await form.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(form.getByRole('status')).toHaveText('Profile updated.')
    const snapshot = await (await page.request.get('/api/users/me')).json()
    expect(snapshot.user.name).toBe('Saved profile')
    const external = await page.request.patch('/api/users/me', { headers: { 'X-Account-Id': user.id, 'If-Match': `"${snapshot.profileVersion}"` }, data: { name: 'Newer saved profile' } })
    expect(external.status()).toBe(200)
    await form.getByLabel('Full Name', { exact: true }).fill('Older draft')
    await form.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(form.getByRole('alert')).toContainText('Your saved profile changed')
    await expect(form.getByLabel('Full Name', { exact: true })).toHaveValue('Older draft')
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe('Newer saved profile')
    await form.getByRole('button', { name: 'Discard draft and reload', exact: true }).click()
    await expect(form.getByLabel('Full Name', { exact: true })).toHaveValue('Newer saved profile')
    await form.getByLabel('Full Name', { exact: true }).fill('Final saved profile')
    await form.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(form.getByRole('status')).toHaveText('Profile updated.')
    const wrongOwner = await page.request.patch('/api/users/me', { headers: { 'X-Account-Id': 'another-account', 'If-Match': `"${snapshot.profileVersion}"` }, data: { name: 'Foreign draft' } })
    expect(wrongOwner.status()).toBe(409)
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ name: 'Final saved profile', password: stored, role: 'USER', freeSessionCredits: 3, phone: null })
    expect((await (await page.request.get('/api/auth/session')).json()).user.id).toBe(user.id)
  } finally { try { await db.user.delete({ where: { id: user.id } }) } finally { await db.$disconnect() } }
})
