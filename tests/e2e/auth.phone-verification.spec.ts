import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

test('phone status is private, missing SMS configuration is truthful and changing the saved number clears prior proof', async ({ page, browser, baseURL }) => {
  test.setTimeout(120_000)
  const settings = loadTestDatabaseEnvironment()
  await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const email = `phone-flow-${crypto.randomUUID()}@example.test`, password = `Test-${crypto.randomUUID()}!`, stored = await bcrypt.hash(password, 4)
  const user = await db.user.create({ data: { email, name: 'Phone Flow', password: stored, freeSessionCredits: 3 } })
  const phone = '+15555550101', other = '+15555550102'
  const anonymous = await browser.newContext({ baseURL })
  try {
    expect((await anonymous.request.get('/api/users/me/phone-verification')).status()).toBe(401)
    await page.goto('/auth/signin')
    await page.getByLabel('Email', { exact: true }).fill(email)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 })
    await page.goto('/dashboard/settings')
    const form = page.getByRole('form', { name: 'Edit profile', exact: true }), card = page.getByRole('region', { name: 'Phone verification', exact: true })
    await expect(form.getByLabel('Phone (Optional)', { exact: true })).toBeVisible({ timeout: 30_000 })
    await form.getByLabel('Phone (Optional)', { exact: true }).fill(phone)
    await form.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(form.getByRole('status')).toHaveText('Profile updated.')
    await expect(card.getByText(phone, { exact: true })).toBeVisible()
    await expect(card.getByText('SMS verification is temporarily unavailable. Please try again later.', { exact: true })).toBeVisible()
    const response = await page.request.get('/api/users/me/phone-verification'), status = await response.json()
    expect(response.headers()['cache-control']).toBe('private, no-store')
    expect(status).toMatchObject({ ownerId: user.id, phone, available: false, canVerify: true, verifiedAt: null, challenge: null })
    expect(JSON.stringify(status)).not.toContain(stored)
    const unavailable = await page.request.post('/api/users/me/phone-verification', { data: { action: 'request', ownerId: user.id, phone, consent: true } })
    expect(unavailable.status()).toBe(503)
    expect(await db.phoneVerification.count({ where: { userId: user.id } })).toBe(0)
    const wrongOwner = await page.request.post('/api/users/me/phone-verification', { data: { action: 'request', ownerId: 'another-account', phone, consent: true } })
    expect(wrongOwner.status()).toBe(409)
    // Prior approval is an explicit isolated database fixture, not a real SMS or an application bypass.
    await db.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date(), phoneVerifiedHash: crypto.createHash('sha256').update(phone).digest('hex') } })
    await card.getByRole('button', { name: 'Refresh phone verification', exact: true }).click()
    await expect(card.getByText('Phone verified.', { exact: true })).toBeVisible()
    await form.getByLabel('Phone (Optional)', { exact: true }).fill(other)
    await form.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(card.getByText(other, { exact: true })).toBeVisible()
    await expect(card.getByText('Your phone has not been verified.', { exact: true })).toBeVisible()
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ phone: other, phoneVerifiedAt: null, phoneVerifiedHash: null, password: stored, role: 'USER', freeSessionCredits: 3 })
    expect((await (await page.request.get('/api/auth/session')).json()).user.id).toBe(user.id)
  } finally { await anonymous.close(); try { await db.user.delete({ where: { id: user.id } }) } finally { await db.$disconnect() } }
})
