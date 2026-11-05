import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { generateAuthenticatorCode, matchingRecoveryCode } from '../../src/lib/auth/two-factor-crypto'

test('an owner enables an authenticator, signs in with one-use factors, and disables it without reviving old sessions', async ({ page, browser, baseURL }) => {
  test.setTimeout(240000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const email = `authenticator-${randomUUID()}@example.test`
  const password = `Test-${randomUUID()}!`
  const account = await db.user.create({ data: { email, password: await bcrypt.hash(password, 8) } })
  const contexts: BrowserContext[] = []
  let clientNumber = 10
  // Distinct simulated clients must not exhaust the shared proxy/IP budget across auth journeys.
  // The database factor throttle remains shared by account across all of these clients.
  const clientHeaders = () => ({ 'x-forwarded-for': `192.0.2.${clientNumber++}` })
  await page.context().setExtraHTTPHeaders(clientHeaders())
  const login = async (target: Page, code = '', accepted = true) => {
    await target.goto('/auth/signin')
    await target.getByLabel('Email', { exact: true }).fill(email)
    await target.getByLabel('Password', { exact: true }).fill(password)
    await target.getByLabel('Authenticator or recovery code (if enabled)', { exact: true }).fill(code)
    const submitted = target.waitForResponse(response => response.url().includes('/api/auth/callback/credentials') && response.request().method() === 'POST')
    await target.getByRole('button', { name: 'Sign In', exact: true }).click()
    const submittedResponse = await submitted
    expect(submittedResponse.status(), 'The simulated client must not exhaust the IP request budget').not.toBe(429)
    if (accepted) await expect(target).toHaveURL(/\/dashboard$/, { timeout: 30000 })
    else {
      await expect(target.getByText('Invalid credentials', { exact: true })).toBeVisible({ timeout: 30000 })
      expect(await (await target.request.get('/api/auth/session')).json()).toBeNull()
    }
  }
  const freshPage = async () => { const context = await browser.newContext({ baseURL, extraHTTPHeaders: clientHeaders() }); contexts.push(context); return context.newPage() }
  try {
    await login(page)
    const oldSession = await browser.newContext({ baseURL, storageState: await page.context().storageState(), extraHTTPHeaders: clientHeaders() }); contexts.push(oldSession)
    await page.goto('/dashboard/settings')
    await page.getByLabel('Password for two-factor changes', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Set up authenticator', exact: true }).click()
    const secret = await page.locator('[data-test="mfa-setup-key"]').textContent({ timeout: 30000 })
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    await page.getByLabel('Code from authenticator', { exact: true }).fill(generateAuthenticatorCode(secret!))
    await page.getByRole('button', { name: 'Enable two-factor authentication', exact: true }).click()
    await expect(page.locator('[data-test="mfa-recovery-code"]')).toHaveCount(8, { timeout: 30000 })
    const recovery = await page.locator('[data-test="mfa-recovery-code"]').allTextContents()
    expect((await oldSession.request.get('/api/users/me/two-factor')).status()).toBe(401)
    await page.getByLabel('I saved my recovery codes', { exact: true }).check()
    await page.getByRole('button', { name: 'Sign out and sign in again', exact: true }).click()
    await expect(page).toHaveURL(/\/auth\/signin/, { timeout: 30000 })
    await login(page, '', false)
    const factor = await db.twoFactorCredential.findUniqueOrThrow({ where: { userId: account.id } })
    // Accept the next clock step within the configured one-step skew instead of sleeping for a new code.
    const timestamp = Math.max(Date.now(), Number(factor.lastAcceptedStep! + BigInt(1)) * 30000)
    const freshCode = generateAuthenticatorCode(secret!, timestamp)
    await login(page, freshCode)
    const replayPage = await freshPage(); await login(replayPage, freshCode, false)
    const beforeRecovery = await db.twoFactorCredential.findUniqueOrThrow({ where: { userId: account.id } })
    expect(matchingRecoveryCode(account.id, recovery[0], beforeRecovery.recoveryHashes)).toBe(0)
    const recoveredPage = await freshPage(); await login(recoveredPage, recovery[0])
    expect((await db.twoFactorCredential.findUniqueOrThrow({ where: { userId: account.id } })).recoveryHashes).toHaveLength(7)
    await login(replayPage, recovery[0], false)
    await recoveredPage.goto('/dashboard/settings')
    await recoveredPage.getByLabel('Password for two-factor changes', { exact: true }).fill(password)
    await recoveredPage.getByLabel('Authenticator or recovery code', { exact: true }).fill(recovery[1])
    await recoveredPage.getByRole('button', { name: 'Disable two-factor authentication', exact: true }).click()
    await expect(recoveredPage.getByRole('status').filter({ hasText: 'Two-factor authentication is disabled.' })).toBeVisible({ timeout: 30000 })
    expect((await page.request.get('/api/users/me/two-factor')).status()).toBe(401)
    expect((await oldSession.request.get('/api/users/me/two-factor')).status()).toBe(401)
    await recoveredPage.getByRole('button', { name: 'Sign out and sign in again', exact: true }).click()
    await expect(recoveredPage).toHaveURL(/\/auth\/signin/, { timeout: 30000 })
    await login(recoveredPage)
    expect((await db.user.findUniqueOrThrow({ where: { id: account.id } })).securityVersion).toBe(2)
    expect(await db.twoFactorCredential.findUnique({ where: { userId: account.id } })).toBeNull()
  } finally {
    for (const context of contexts) await context.close()
    try { await db.user.delete({ where: { id: account.id } }) } finally { await db.$disconnect() }
  }
})
