import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { test, expect, type Page } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { loadTestDatabaseEnvironment, verifyTestDatabaseConnection } from '../../../scripts/test-database'

test('an administrator drafts, publishes and withdraws audio while current listener access and private metadata stay protected', async ({ page, browser, baseURL }) => {
  test.setTimeout(210000)
  const settings = loadTestDatabaseEnvironment(); await verifyTestDatabaseConnection(settings)
  const db = new PrismaClient({ datasources: { db: { url: settings.environment.DATABASE_URL } } })
  const key = randomUUID().replaceAll('-', ''), slug = `audioauthoring${key}`, title = `Private audio ${key}`, password = `Test-${randomUUID()}!`, users: string[] = []
  const adminEmail = `audio-admin-${key}@example.test`, listenerEmail = `audio-listener-${key}@example.test`
  const listenerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-forwarded-for': '192.0.2.99' } })
  const listener = await listenerContext.newPage(); await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': '192.0.2.98' })
  await listener.route('https://media.example.test/**', route => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from('ID3\0\0\0\0\0\0\0') }))
  let trackId = ''
  const login = async (target: Page, email: string) => { await target.goto('/auth/signin'); await target.getByLabel('Email', { exact: true }).fill(email); await target.getByLabel('Password', { exact: true }).fill(password); await target.getByRole('button', { name: 'Sign In', exact: true }).click(); await expect(target).toHaveURL(/\/dashboard$/, { timeout: 30000 }) }
  try {
    const hashed = await bcrypt.hash(password, 4)
    users.push((await db.user.create({ data: { email: adminEmail, password: hashed, role: 'ADMIN' } })).id)
    users.push((await db.user.create({ data: { email: listenerEmail, password: hashed, role: 'USER', vip: true } })).id)
    const payments = await db.payment.findMany({ orderBy: { id: 'asc' } })
    await login(page, adminEmail); await page.goto('/admin'); await page.getByRole('link', { name: 'Manage Audio', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Manage Audio', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'New audio track', exact: true }).click()
    await page.getByLabel('Track title', { exact: true }).fill(title); await page.getByLabel('URL slug', { exact: true }).fill(slug); await page.getByLabel('Category', { exact: true }).fill('Meditation')
    await page.getByRole('button', { name: 'Save audio draft', exact: true }).click()
    await expect(page.getByText('Audio draft created.', { exact: true })).toBeVisible({ timeout: 30000 })
    const draft = await db.audioTrack.findUniqueOrThrow({ where: { slug } }); trackId = draft.id; expect(draft.isPublished).toBe(false); expect(draft.audioUrl).toBe('')
    expect((await listener.request.get(`/api/audio/${slug}`)).status()).toBe(404)
    expect(await (await listener.request.get('/')).text()).not.toContain(title)
    expect((await (await listener.request.get(`/api/search?q=${key}`)).json()).audio).toEqual([])
    await page.getByLabel('Audio URL', { exact: true }).fill('https://media.example.test/quiet.mp3'); await page.getByLabel('Premium audio', { exact: true }).check()
    await expect(page.getByRole('button', { name: 'Publish audio', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Save audio details', exact: true }).click(); await expect(page.getByText('Audio saved.', { exact: true })).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: 'Publish audio', exact: true }).click(); await expect(page.getByText('Audio published.', { exact: true })).toBeVisible({ timeout: 30000 })
    expect((await db.audioTrack.findUniqueOrThrow({ where: { id: trackId } })).isPublished).toBe(true)
    const publicList = await (await listener.request.get('/api/audio')).json(); expect(publicList.tracks.find((track: { id: string }) => track.id === trackId).audioUrl).toBeNull()
    expect((await (await listener.request.get(`/api/search?q=${key}`)).json()).audio.map((track: { id: string }) => track.id)).toContain(trackId)
    expect(await (await listener.request.get('/sitemap.xml')).text()).toContain(`/audio/${slug}`)
    await listener.goto(`/audio/${slug}`); await expect(listener.getByRole('link', { name: 'Sign In', exact: true })).toBeVisible({ timeout: 30000 }); await expect(listener.locator('audio')).toHaveCount(0)
    await login(listener, listenerEmail); await listener.goto(`/audio/${slug}`); await expect(listener.locator('audio')).toHaveAttribute('src', 'https://media.example.test/quiet.mp3', { timeout: 30000 })
    await db.user.update({ where: { id: users[1] }, data: { vip: false } }); await listener.reload()
    await expect(listener.getByRole('link', { name: 'Upgrade to VIP', exact: true })).toBeVisible({ timeout: 30000 }); await expect(listener.locator('audio')).toHaveCount(0)
    await page.getByRole('button', { name: 'Withdraw audio', exact: true }).click(); await expect(page.getByText('Audio withdrawn.', { exact: true })).toBeVisible({ timeout: 30000 })
    expect((await listener.request.get(`/api/audio/${slug}`)).status()).toBe(404)
    expect((await (await listener.request.get(`/api/search?q=${key}`)).json()).audio.map((track: { id: string }) => track.id)).not.toContain(trackId)
    expect(await (await listener.request.get('/sitemap.xml')).text()).not.toContain(`/audio/${slug}`)
    expect(await db.payment.findMany({ orderBy: { id: 'asc' } })).toEqual(payments)
    expect(await db.audioTrack.findUniqueOrThrow({ where: { id: trackId } })).toMatchObject({ isPublished: false, isPremium: true, slug })
    expect((await db.activityLog.findMany({ where: { entityId: trackId }, orderBy: { createdAt: 'asc' } })).map(row => row.action)).toEqual(['audio_draft_created', 'audio_updated', 'audio_published', 'audio_withdrawn'])
    expect((await listener.request.get('/api/admin/audio')).status()).toBe(403)
  } finally {
    await listenerContext.close()
    try { await db.activityLog.deleteMany({ where: { userId: { in: users } } }); if (trackId) await db.audioTrack.deleteMany({ where: { id: trackId } }); await db.user.deleteMany({ where: { id: { in: users } } }) } finally { await db.$disconnect() }
  }
})
