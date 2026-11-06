import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'

test('a real administrator reviews and audits manual benefits without overwriting a newer credit balance', async ({ page, browser, baseURL }) => {
  test.setTimeout(180000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const token = randomUUID(), password = `Test-${randomUUID()}!`, users: string[] = []
  const adminEmail = `benefits-admin-${token}@example.test`, customerEmail = `benefits-customer-${token}@example.test`, customerName = `Benefits customer ${token}`
  const customerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.97' } })
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.96' })
  let planId = '', paymentId = ''
  try {
    const hashed = await bcrypt.hash(password, 4)
    users.push((await db.user.create({ data: { email: adminEmail, password: hashed, role: 'ADMIN' } })).id)
    users.push((await db.user.create({ data: { email: customerEmail, name: customerName, password: hashed, role: 'USER', freeSessionCredits: 2 } })).id)
    const plan = await db.membershipPlan.create({ data: { slug: `benefits-${token}`, title: 'Saved browser plan', interval: 'MONTHLY', pricePaise: 2000, razorpayPlanId: `plan_${token}` } }); planId = plan.id
    const membership = await db.vIPMembership.create({ data: { userId: users[1], planId, subscriptionId: `sub_${token}`, status: 'active', endDate: new Date(Date.now() + 86400000) } })
    const ledger = await db.sessionCredit.create({ data: { userId: users[1], membershipId: membership.id, credits: 2, source: 'membership', expiresAt: membership.endDate } })
    const payment = await db.payment.create({ data: { userId: users[1], type: 'MEMBERSHIP', gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 2000 } }); paymentId = payment.id
    await page.goto('/auth/signin')
    await page.getByLabel('Email', { exact: true }).fill(adminEmail); await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 })
    expect((await (await page.request.get('/api/auth/session')).json()).user.role).toBe('ADMIN')
    await page.goto('/admin')
    const form = page.getByRole('form', { name: `Benefits for ${customerName} (${customerEmail})`, exact: true })
    await expect(form.getByLabel('Free credits', { exact: true })).toHaveValue('2', { timeout: 30000 })
    // A concurrent credit consumption changes the actual account after the administrator's review.
    await db.user.update({ where: { id: users[1] }, data: { freeSessionCredits: { decrement: 1 } } })
    await form.getByLabel('Free credits', { exact: true }).fill('7')
    await form.getByLabel('Reason for change', { exact: true }).fill('Reviewed service recovery')
    await form.getByRole('button', { name: 'Save benefits', exact: true }).click()
    await expect(form.getByRole('alert')).toContainText('credit balance changed', { timeout: 30000 })
    await expect(form.getByLabel('Free credits', { exact: true })).toHaveValue('7')
    expect((await db.user.findUniqueOrThrow({ where: { id: users[1] } })).freeSessionCredits).toBe(1)
    expect(await db.activityLog.count({ where: { entityId: users[1], action: 'user_benefits_updated' } })).toBe(0)
    await form.getByRole('link', { name: 'Reload user list', exact: true }).click()
    await expect(form.getByLabel('Free credits', { exact: true })).toHaveValue('1', { timeout: 30000 })
    await form.getByLabel('Manual VIP', { exact: true }).selectOption('true')
    await form.getByLabel('Free credits', { exact: true }).fill('4')
    await form.getByLabel('Reason for change', { exact: true }).fill('Reviewed service recovery')
    await form.getByRole('button', { name: 'Save benefits', exact: true }).click()
    await expect(form.getByRole('status')).toHaveText('Benefits saved.', { timeout: 30000 })
    expect(await db.user.findUniqueOrThrow({ where: { id: users[1] } })).toMatchObject({ role: 'USER', vip: true, freeSessionCredits: 4, password: hashed })
    const audits = await db.activityLog.findMany({ where: { entityId: users[1], action: 'user_benefits_updated' } })
    expect(audits).toHaveLength(1); expect(audits[0]).toMatchObject({ userId: users[0], metadata: { before: { vip: false, freeSessionCredits: 1 }, after: { vip: true, freeSessionCredits: 4 }, reason: 'Reviewed service recovery' } })
    expect(await db.vIPMembership.findUnique({ where: { id: membership.id } })).toEqual(membership)
    expect(await db.sessionCredit.findUnique({ where: { id: ledger.id } })).toEqual(ledger)
    expect(await db.payment.findUnique({ where: { id: paymentId } })).toEqual(payment)
    const customer = await customerContext.newPage(); await customer.goto('/auth/signin')
    await customer.getByLabel('Email', { exact: true }).fill(customerEmail); await customer.getByLabel('Password', { exact: true }).fill(password)
    await customer.getByRole('button', { name: 'Sign In', exact: true }).click(); await expect(customer).toHaveURL(/\/dashboard$/, { timeout: 30000 })
    expect((await (await customer.request.get('/api/auth/session')).json()).user).toMatchObject({ id: users[1], role: 'USER', freeSessionCredits: 4 })
    await customer.goto('/admin'); await expect(customer).toHaveURL(new URL('/', baseURL).href, { timeout: 30000 })
  } finally {
    await customerContext.close()
    try {
      await db.activityLog.deleteMany({ where: { userId: { in: users } } })
      if (paymentId) await db.payment.deleteMany({ where: { id: paymentId } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      if (planId) await db.membershipPlan.deleteMany({ where: { id: planId } })
    } finally { await db.$disconnect() }
  }
})
