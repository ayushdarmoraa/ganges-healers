import { test, expect } from '@playwright/test'

test('an admin can draft, preview, publish, edit, withdraw, and republish an article', async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000)
  const term = `blogquartz${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  const title = `A ${term} practice`
  const slug = `a-${term}-practice`
  const content = `A plain text article about ${term}.\n<strong>Shown as text</strong>`
  const reader = await browser.newContext({ baseURL })
  let articleId = ''
  try {
    expect((await page.goto(`/api/test/login?role=ADMIN&email=blog-admin-${term}@example.test`))?.ok()).toBeTruthy()
    await page.goto('/admin/blog/new')
    await expect(page.getByRole('heading', { name: 'New article' })).toBeVisible({ timeout: 30_000 })
    await page.getByLabel('Title', { exact: true }).fill(title)
    await expect(page.getByLabel('URL slug')).toHaveValue(slug)
    await page.getByLabel('Summary', { exact: true }).fill(`Summary for ${term}`)
    await page.getByLabel('Article content', { exact: true }).fill(content)
    await page.getByRole('button', { name: 'Preview', exact: true }).click()
    await expect(page.getByRole('article', { name: 'Article preview' })).toContainText('<strong>Shown as text</strong>')
    const created = page.waitForResponse(response => response.url().endsWith('/api/admin/blog') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Save draft', exact: true }).click()
    const createdResponse = await created
    expect(createdResponse.status()).toBe(201)
    const draft = (await createdResponse.json()).data
    articleId = draft.id
    expect(draft.published).toBe(false)
    await expect(page).toHaveURL(new RegExp(`/admin/blog/${articleId}$`), { timeout: 30_000 })
    await expect(page.getByLabel('URL slug')).toHaveAttribute('readonly', '')
    expect((await reader.request.get(`/api/admin/blog?id=${articleId}`)).status()).toBe(403)
    expect((await reader.request.get(`/api/blog/${slug}`)).status()).toBe(404)
    expect((await reader.request.get(`/api/blog/${articleId}`)).status()).toBe(404)
    expect((await (await reader.request.get('/api/blog')).json()).some((row: { id: string }) => row.id === articleId)).toBe(false)
    expect((await (await reader.request.get(`/api/search?q=${term}`)).json()).blog).toEqual([])

    const confirm = async (action: 'Confirm publish' | 'Confirm unpublish' | 'Save live changes') => {
      const saved = page.waitForResponse(response => response.url().endsWith('/api/admin/blog') && response.request().method() === 'PATCH')
      await page.getByRole('dialog').getByRole('button', { name: action, exact: true }).click()
      const response = await saved
      expect(response.status()).toBe(200)
      await expect(page.getByRole('dialog')).not.toBeVisible()
      return (await response.json()).data
    }
    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText('<strong>Shown as text</strong>')
    expect((await confirm('Confirm publish')).published).toBe(true)
    const publicPage = await reader.newPage()
    await publicPage.goto(`/blog/${slug}`)
    await expect(publicPage.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 30_000 })
    await expect(publicPage.getByText('<strong>Shown as text</strong>', { exact: false })).toBeVisible()
    expect(await publicPage.locator('article strong').count()).toBe(0)
    expect((await (await reader.request.get(`/api/search?q=${term}`)).json()).blog).toEqual(expect.arrayContaining([expect.objectContaining({ id: articleId })]))
    expect(await (await reader.request.get('/sitemap.xml')).text()).toContain(`/blog/${slug}`)
    await publicPage.goto('/')
    await expect(publicPage.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 30_000 })

    await page.getByLabel('Title', { exact: true }).fill(`${title} revised`)
    await page.getByRole('button', { name: 'Save live changes', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText(`${title} revised`)
    const revised = await confirm('Save live changes')
    expect(revised.slug).toBe(slug)
    expect((await (await reader.request.get(`/api/blog/${slug}`)).json()).title).toBe(`${title} revised`)
    expect((await (await reader.request.get(`/api/search?q=${term}`)).json()).blog).toEqual(expect.arrayContaining([expect.objectContaining({ id: articleId, title: `${title} revised` })]))

    await page.getByRole('button', { name: 'Unpublish', exact: true }).click()
    const withdrawn = await confirm('Confirm unpublish')
    expect(withdrawn).toMatchObject({ id: articleId, slug, content, published: false })
    expect((await reader.request.get(`/api/blog/${slug}`)).status()).toBe(404)
    expect((await reader.request.get(`/api/blog/${articleId}`)).status()).toBe(404)
    expect((await (await reader.request.get('/api/blog')).json()).some((row: { id: string }) => row.id === articleId)).toBe(false)
    expect((await (await reader.request.get(`/api/search?q=${term}`)).json()).blog).toEqual([])
    expect(await (await reader.request.get('/sitemap.xml')).text()).not.toContain(`/blog/${slug}`)
    await publicPage.reload()
    await expect(publicPage.getByRole('heading', { name: `${title} revised`, exact: true })).not.toBeVisible()

    await page.getByRole('button', { name: 'Publish', exact: true }).click()
    expect((await confirm('Confirm publish')).id).toBe(articleId)
    await publicPage.goto(`/blog/${slug}`)
    await expect(publicPage.getByRole('heading', { level: 1, name: `${title} revised` })).toBeVisible()
  } finally {
    if (articleId) {
      const response = await page.request.get(`/api/admin/blog?id=${articleId}`)
      if (response.ok()) {
        const saved = (await response.json()).data
        if (saved.published) await page.request.patch('/api/admin/blog', { data: { id: articleId, version: saved.version, changes: { published: false } } })
      }
    }
    await reader.close()
  }
})
