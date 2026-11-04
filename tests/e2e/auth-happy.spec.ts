import crypto from 'node:crypto'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'

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
