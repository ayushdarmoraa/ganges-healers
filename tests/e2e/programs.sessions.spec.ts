import { randomUUID } from 'node:crypto'
import { test, expect, type BrowserContext } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../scripts/test-database'
import { clinicDate, clinicSlotInstant } from '../../src/lib/bookings/time'
import { buildProgramSchedule } from '../../src/lib/programs/schedule'

test('staff assigns and reserves a program session; the customer sees it and only the assigned practitioner completes it', async ({ page, browser, baseURL }) => {
  test.setTimeout(240000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const suffix = randomUUID()
  const emails = { owner: `program-owner-${suffix}@example.test`, admin: `program-admin-${suffix}@example.test`, healer: `program-healer-${suffix}@example.test`, outsider: `program-other-${suffix}@example.test` }
  const userIds: string[] = []; let programId = ''
  const contexts: BrowserContext[] = []
  const contextFor = async (ip: string) => {
    const context = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': ip } })
    contexts.push(context)
    return context
  }
  const login = async (context: BrowserContext, role: string, email: string, userId: string) => {
    const response = await context.request.get(`/api/test/login?${new URLSearchParams({ role, email })}`)
    expect(response.status()).toBe(200)
    expect(await response.json()).toMatchObject({ role, userId })
  }
  try {
    const owner = await db.user.create({ data: { email: emails.owner, role: 'USER', name: 'Program Customer' } }); userIds.push(owner.id)
    for (const [key, role] of [['admin', 'ADMIN'], ['healer', 'HEALER'], ['outsider', 'USER']] as const) userIds.push((await db.user.create({ data: { email: emails[key], role, name: key === 'healer' ? 'Program Practitioner' : key } })).id)
    const healer = await db.healer.create({ data: { userId: userIds[2], isActive: true, availability: Object.fromEntries(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => [day, { start: '10:00', end: '20:00' }])) } })
    const program = await db.program.create({ data: { slug: `program-journey-${suffix}`, title: 'Program Session Journey', description: 'Isolated browser fixture', pricePaise: 25000, totalSessions: 1, sessionsPerWeek: 1, durationMinutes: 60 } }); programId = program.id
    // This isolated active entitlement tests scheduling, not real provider payment delivery.
    const enrollment = await db.programEnrollment.create({ data: { userId: owner.id, programId, status: 'active', pricePaise: 25000, schedule: buildProgramSchedule(1, 1, 60, new Date()).sessions } })
    await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.101' })
    await login(page.context(), 'ADMIN', emails.admin, userIds[1])
    await page.goto(`/admin/program-enrollments?${new URLSearchParams({ healerQuery: healer.id })}`)
    const card = page.locator(`[data-enrollment-id="${enrollment.id}"]`)
    await expect(card).toBeVisible({ timeout: 30000 })
    await card.getByLabel('Assign practitioner', { exact: true }).selectOption(healer.id)
    await card.getByRole('button', { name: 'Assign practitioner', exact: true }).click()
    await expect(card.getByText('Practitioner: Program Practitioner', { exact: true })).toBeVisible({ timeout: 30000 })
    const date = clinicDate(new Date(Date.now() + 9 * 86400000))
    await card.getByLabel('Date for session 1', { exact: true }).fill(date)
    await expect(card.getByRole('option', { name: '10:00', exact: true })).toBeAttached({ timeout: 30000 })
    await card.getByLabel('Time for session 1 (IST)', { exact: true }).selectOption('10:00')
    await card.getByRole('button', { name: 'Confirm session', exact: true }).click()
    await expect(card.getByText('Confirmed', { exact: true })).toBeVisible({ timeout: 30000 })
    const download = `/api/program-enrollments/${enrollment.id}/sessions/1/calendar`
    const exported = await page.request.get(download)
    expect(exported.status()).toBe(200); expect(await exported.text()).toContain('STATUS:CONFIRMED')
    const actual = await db.programSession.findUniqueOrThrow({ where: { enrollmentId_sessionNumber: { enrollmentId: enrollment.id, sessionNumber: 1 } } })
    expect(actual.scheduledAt.toISOString()).toBe(clinicSlotInstant(date, '10:00').toISOString())
    const slots = (await (await page.request.get(`/api/availability?${new URLSearchParams({ healerId: healer.id, date })}`)).json()).data.slots as Array<{ time: string; available: boolean }>
    expect(slots.find(slot => slot.time === '10:00')?.available).toBe(false)
    // Background session refreshes from one role must never replace another role's test cookie.
    const ownerContext = await contextFor('192.0.2.102')
    await login(ownerContext, 'USER', emails.owner, owner.id)
    const ownerPage = await ownerContext.newPage()
    await ownerPage.goto('/dashboard/programs')
    const ownerCard = ownerPage.locator(`[data-enrollment-id="${enrollment.id}"]`)
    await expect(ownerCard.getByText('Confirmed', { exact: true })).toBeVisible({ timeout: 30000 })
    await expect(ownerCard.getByRole('link', { name: 'Download calendar' })).toHaveAttribute('href', download)
    await expect(ownerCard.getByRole('button', { name: 'Mark session completed' })).toHaveCount(0)
    expect((await ownerContext.request.get(download)).status()).toBe(200)
    expect((await ownerContext.request.patch(`/api/program-enrollments/${enrollment.id}`, { data: { action: 'complete', sessionNumber: 1 } })).status()).toBe(403)
    const outsiderContext = await contextFor('192.0.2.103')
    await login(outsiderContext, 'USER', emails.outsider, userIds[3])
    expect((await outsiderContext.request.get(download)).status()).toBe(404)
    // Advance only this fixture's reservation to represent an ended appointment.
    await db.programSession.update({ where: { id: actual.id }, data: { scheduledAt: new Date(Date.now() - 7200000) } })
    const healerContext = await contextFor('192.0.2.104')
    await login(healerContext, 'HEALER', emails.healer, userIds[2])
    const healerPage = await healerContext.newPage()
    await healerPage.goto('/healer/programs')
    const healerCard = healerPage.locator(`[data-enrollment-id="${enrollment.id}"]`)
    await healerCard.getByRole('button', { name: 'Mark session completed' }).click()
    await expect(healerCard.getByText('1 of 1 sessions completed · 100%', { exact: true })).toBeVisible({ timeout: 30000 })
    expect((await db.programEnrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe('completed')
  } finally {
    await Promise.allSettled(contexts.map(context => context.close()))
    try { if (programId) await db.program.deleteMany({ where: { id: programId } }); await db.user.deleteMany({ where: { id: { in: userIds } } }) } finally { await db.$disconnect() }
  }
})
