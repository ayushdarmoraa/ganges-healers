import { test, expect } from '@playwright/test'

test('admins organize topics and tags without breaking discussions or in-progress drafts', async ({ page, browser, baseURL }) => {
  test.setTimeout(180_000)
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const topicName = `Daily Practice ${token}`
  const topicSlug = `daily-practice-${token}`
  const tagName = `Practice Tag ${token}`
  const tagSlug = `practice-tag-${token}`
  const member = await browser.newContext({ baseURL })
  let postId = ''
  try {
    expect((await page.goto(`/api/test/login?role=ADMIN&email=catalog-admin-${token}@example.test`))?.ok()).toBeTruthy()
    await page.goto('/admin/community/catalog')
    await expect(page.getByRole('heading', { name: 'Community Topics & Tags' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Create topic', exact: true }).click()
    let dialog = page.getByRole('dialog')
    await dialog.getByLabel('Topic name').fill(topicName)
    await expect(dialog.getByLabel('URL slug')).toHaveValue(topicSlug)
    await dialog.getByLabel('Description').fill('A space for daily practice')
    const createdTopic = page.waitForResponse(response => response.url().endsWith('/api/admin/community/catalog') && response.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Create topic', exact: true }).click()
    const topicResponse = await createdTopic
    expect(topicResponse.status()).toBe(201)
    const topicId = (await topicResponse.json()).data.id
    await expect(dialog).not.toBeVisible()

    await page.getByRole('button', { name: 'Tags', exact: true }).click()
    await page.getByRole('button', { name: 'Create tag', exact: true }).click()
    dialog = page.getByRole('dialog')
    await dialog.getByLabel('Tag name').fill(tagName)
    const createdTag = page.waitForResponse(response => response.url().endsWith('/api/admin/community/catalog') && response.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Create tag', exact: true }).click()
    const tagResponse = await createdTag
    expect(tagResponse.status()).toBe(201)
    const tagId = (await tagResponse.json()).data.id
    await expect(dialog).not.toBeVisible()

    expect((await member.request.get(`/api/test/login?role=USER&vip=1&email=catalog-member-${token}@example.test`)).ok()).toBeTruthy()
    expect((await member.request.post('/api/admin/community/catalog', { data: { kind: 'tag', name: 'Forbidden', slug: `forbidden-${token}` } })).status()).toBe(403)
    const writer = await member.newPage()
    await writer.goto(`/community/create?topic=${topicSlug}`)
    await expect(writer.getByLabel('Topic', { exact: true })).toHaveValue(topicId, { timeout: 30_000 })
    await writer.getByLabel('Title', { exact: true }).fill(`Our daily practice ${token}`)
    await writer.getByLabel('Content', { exact: true }).fill('A discussion in the newly created topic.')
    await writer.getByRole('button', { name: tagName, exact: true }).click()
    const published = writer.waitForResponse(response => response.url().endsWith('/api/community/posts') && response.request().method() === 'POST')
    await writer.getByRole('button', { name: 'Publish', exact: true }).click()
    const publication = await published
    expect(publication.status()).toBe(201)
    postId = (await publication.json()).data.id
    await expect(writer).toHaveURL(new RegExp(`/community/post/${postId}$`), { timeout: 30_000 })

    const search = async (slug: string) => {
      await page.getByLabel('Search topics or tags').fill(slug)
      const searched = page.waitForResponse(response => response.url().includes('/api/admin/community/catalog?') && new URL(response.url()).searchParams.get('q') === slug)
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      expect((await searched).status()).toBe(200)
    }
    const saveEdit = async () => {
      const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/community/catalog') && response.request().method() === 'PATCH')
      await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click()
      expect((await saved).status()).toBe(200)
      await expect(page.getByRole('dialog')).not.toBeVisible()
    }
    await search(tagSlug)
    await page.getByRole('button', { name: `Edit ${tagName}`, exact: true }).click()
    await page.getByRole('dialog').getByLabel('Tag name').fill(`${tagName} Together`)
    await saveEdit()
    await page.getByRole('button', { name: 'Topics', exact: true }).click()
    await search(topicSlug)
    await page.getByRole('button', { name: `Edit ${topicName}`, exact: true }).click()
    await expect(page.getByRole('dialog').getByLabel('URL slug')).toHaveAttribute('readonly', '')
    await page.getByRole('dialog').getByLabel('Topic name').fill(`${topicName} Together`)
    await page.getByRole('dialog').getByLabel('Display order').fill('-25')
    await saveEdit()
    const savedPost = (await (await member.request.get(`/api/community/posts/${postId}`)).json()).data
    expect(savedPost.topic).toMatchObject({ id: topicId, slug: topicSlug, name: `${topicName} Together` })
    expect(savedPost.tags).toContainEqual(expect.objectContaining({ tag: expect.objectContaining({ id: tagId, slug: tagSlug, name: `${tagName} Together` }) }))

    // Keep a loaded composer open while a different account deactivates its topic.
    await writer.goto(`/community/create?topic=${topicSlug}`)
    await expect(writer.getByLabel('Topic', { exact: true })).toHaveValue(topicId)
    await writer.getByLabel('Title', { exact: true }).fill(`Keep my draft ${token}`)
    await writer.getByLabel('Content', { exact: true }).fill('This text must survive an unavailable topic.')
    await page.getByRole('button', { name: `Deactivate ${topicName} Together`, exact: true }).click()
    const deactivated = page.waitForResponse(response => response.url().endsWith('/api/admin/community/catalog') && response.request().method() === 'PATCH')
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm deactivation' }).click()
    expect((await deactivated).status()).toBe(200)
    await expect(page.getByRole('dialog')).not.toBeVisible()
    const rejected = writer.waitForResponse(response => response.url().endsWith('/api/community/posts') && response.request().method() === 'POST')
    await writer.getByRole('button', { name: 'Publish', exact: true }).click()
    expect((await rejected).status()).toBe(400)
    await expect(writer.getByText(/That topic is no longer available/)).toBeVisible()
    await expect(writer.getByLabel('Title', { exact: true })).toHaveValue(`Keep my draft ${token}`)
    expect((await member.request.get(`/api/community/posts/${postId}`)).status()).toBe(200)

    await page.getByRole('button', { name: `Activate ${topicName} Together`, exact: true }).click()
    const activated = page.waitForResponse(response => response.url().endsWith('/api/admin/community/catalog') && response.request().method() === 'PATCH')
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm activation' }).click()
    expect((await activated).status()).toBe(200)
    await writer.goto(`/community/topic/${topicSlug}`)
    await expect(writer.getByRole('heading', { level: 1, name: `${topicName} Together` })).toBeVisible()
    await expect(writer.getByRole('link', { name: `Read discussion: Our daily practice ${token}` })).toBeVisible()
    await writer.goto(`/community/tag/${tagSlug}`)
    await expect(writer.getByRole('heading', { level: 1, name: `#${tagName} Together` })).toBeVisible()
  } finally {
    if (postId) await member.request.delete(`/api/community/posts/${postId}`)
    await member.close()
  }
})
