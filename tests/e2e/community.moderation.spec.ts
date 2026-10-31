import { test, expect } from '@playwright/test'

test('a member report can be reviewed, hidden, restored, and pinned by an admin', async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000)
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const author = await browser.newContext({ baseURL })
  const moderator = await browser.newContext({ baseURL })
  let postId = ''
  try {
    expect((await author.request.get(`/api/test/login?role=USER&vip=1&email=community-author-${token}@example.test`)).ok()).toBeTruthy()
    const created = await author.request.post('/api/community/posts', { data: { title: `Moderation discussion ${token}`, content: 'A discussion created for the community moderation flow.' } })
    expect(created.status()).toBe(201)
    postId = (await created.json()).data.id

    expect((await page.goto(`/api/test/login?role=USER&vip=1&email=community-reporter-${token}@example.test`))?.ok()).toBeTruthy()
    // This new guard must reject an ordinary user even in the isolated TEST_MODE runtime.
    expect((await page.request.get('/api/admin/community')).status()).toBe(403)
    await page.goto(`/community/post/${postId}`)
    await expect(page.getByRole('heading', { name: `Moderation discussion ${token}` })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Report discussion', exact: true }).click()
    await page.getByLabel('Reason for reporting').fill(`Please review this advice ${token}`)
    const submitted = page.waitForResponse(response => response.url().endsWith('/api/community/reports') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Submit Report' }).click()
    expect((await submitted).status()).toBe(201)
    await expect(page.getByRole('button', { name: 'Discussion already reported' })).toBeDisabled()

    expect((await moderator.request.get(`/api/test/login?role=ADMIN&email=community-admin-${token}@example.test`)).ok()).toBeTruthy()
    const admin = await moderator.newPage()
    await admin.goto('/admin/community')
    await expect(admin.getByRole('heading', { name: 'Community Moderation' })).toBeVisible({ timeout: 30_000 })
    await admin.getByLabel('Search reason or reporter').fill(postId)
    const searched = admin.waitForResponse(response => response.url().includes('/api/admin/community?') && new URL(response.url()).searchParams.get('q') === postId)
    await admin.getByRole('button', { name: 'Search', exact: true }).click()
    expect((await searched).ok()).toBeTruthy()
    await admin.getByRole('button', { name: 'Hide & resolve' }).click()
    const dialog = admin.getByRole('dialog')
    await expect(dialog.getByText('A discussion created for the community moderation flow.')).toBeVisible()
    const hidden = admin.waitForResponse(response => response.url().endsWith('/api/admin/community') && response.request().method() === 'PATCH')
    await dialog.getByRole('button', { name: 'Confirm decision' }).click()
    expect((await hidden).status()).toBe(200)
    await expect(dialog).not.toBeVisible()
    expect((await page.request.get(`/api/community/posts/${postId}`)).status()).toBe(404)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'This discussion is unavailable' })).toBeVisible()

    await admin.getByLabel('Report status').selectOption('reviewed')
    await admin.getByRole('button', { name: 'Restore content', exact: true }).click()
    const restored = admin.waitForResponse(response => response.url().endsWith('/api/admin/community') && response.request().method() === 'PATCH')
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirm decision' }).click()
    expect((await restored).status()).toBe(200)
    await expect(admin.getByRole('dialog')).not.toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { name: `Moderation discussion ${token}` })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Report discussion', exact: true })).toBeEnabled()

    await admin.getByRole('button', { name: 'Content', exact: true }).click()
    await admin.getByLabel('Search content').fill(token)
    const contentSearch = admin.waitForResponse(response => response.url().includes('/api/admin/community?') && new URL(response.url()).searchParams.get('q') === token)
    await admin.getByRole('button', { name: 'Search', exact: true }).click()
    expect((await contentSearch).ok()).toBeTruthy()
    await admin.getByRole('button', { name: 'Pin discussion', exact: true }).click()
    const pinned = admin.waitForResponse(response => response.url().endsWith('/api/admin/community') && response.request().method() === 'PATCH')
    await admin.getByRole('dialog').getByRole('button', { name: 'Confirm decision' }).click()
    expect((await pinned).status()).toBe(200)
    await expect(admin.getByRole('dialog')).not.toBeVisible()
    expect((await (await page.request.get(`/api/community/posts/${postId}`)).json()).data.isPinned).toBe(true)
    const history = await moderator.request.get(`/api/admin/community?status=reviewed&q=${postId}`)
    expect((await history.json()).data).toEqual(expect.arrayContaining([expect.objectContaining({ targetId: postId, status: 'reviewed', reviewedBy: expect.any(String), reviewedAt: expect.any(String) })]))
  } finally {
    if (postId) await author.request.delete(`/api/community/posts/${postId}`)
    await author.close()
    await moderator.close()
  }
})
