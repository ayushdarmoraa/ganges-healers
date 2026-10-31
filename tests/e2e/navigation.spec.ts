import { test, expect } from '@playwright/test'

test('desktop and mobile header search real content and retain a working cart', async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000)
  const term = `navquartz${Date.now()}${Math.random().toString(36).slice(2, 6)}`
  const title = `Navigation practice ${term}`
  const editor = await browser.newContext({ baseURL })
  let articleId = ''
  try {
    expect((await editor.request.get(`/api/test/login?role=ADMIN&email=nav-editor-${term}@example.test`)).ok()).toBeTruthy()
    const created = await editor.request.post('/api/admin/blog', { data: { slug: term, title, content: `An indexed article about ${term}.`, excerpt: `Practice ${term}` } })
    expect(created.status()).toBe(201)
    const draft = (await created.json()).data
    articleId = draft.id
    expect((await editor.request.patch('/api/admin/blog', { data: { id: draft.id, version: draft.version, changes: { published: true } } })).status()).toBe(200)

    await page.goto('/')
    const searchTrigger = page.getByRole('button', { name: 'Open search', exact: true })
    await searchTrigger.click()
    let palette = page.getByRole('dialog', { name: 'Search', exact: true })
    await expect(palette.getByRole('textbox', { name: 'Search input' })).toBeFocused()
    await expect(palette.getByRole('link', { name: 'Store', exact: true })).toHaveAttribute('href', '/store')
    await palette.getByRole('textbox', { name: 'Search input' }).fill(term)
    const article = palette.getByRole('link', { name: new RegExp(title) })
    await expect(article).toHaveAttribute('href', `/blog/${term}`, { timeout: 30_000 })
    await page.keyboard.press('ArrowDown')
    await expect(article).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/blog/${term}$`), { timeout: 30_000 })
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()

    await page.keyboard.press('Control+k')
    palette = page.getByRole('dialog', { name: 'Search', exact: true })
    await palette.getByRole('textbox', { name: 'Search input' }).fill(term)
    await palette.getByRole('textbox', { name: 'Search input' }).press('Enter')
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${term}$`), { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Search Results', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute('href', `/blog/${term}`, { timeout: 30_000 })

    const catalog = await page.request.get('/api/store/products?limit=50')
    expect(catalog.ok()).toBeTruthy()
    const product = (await catalog.json()).items.find((row: { stockStatus: string }) => row.stockStatus !== 'OUT')
    expect(product).toBeTruthy()
    await page.goto(`/store/${product.slug}`)
    await expect(page.getByRole('heading', { level: 1, name: product.title })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Add to Cart', exact: true }).click()
    let cart = page.getByRole('dialog', { name: 'Your Cart (1)', exact: true })
    await expect(cart).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    await expect(cart).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'Open cart', exact: true })).toHaveAttribute('data-cart-count', '1')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Open cart', exact: true })).toHaveAttribute('data-cart-count', '1', { timeout: 30_000 })
    await page.getByRole('button', { name: 'Open cart', exact: true }).click()
    cart = page.getByRole('dialog', { name: 'Your Cart (1)', exact: true })
    await cart.getByRole('button', { name: `Increase quantity of ${product.title}`, exact: true }).click()
    await expect(page.getByRole('button', { name: 'Open cart', exact: true })).toHaveAttribute('data-cart-count', '2')
    await expect(page.getByRole('link', { name: 'Proceed to Checkout' })).toHaveAttribute('href', '/store/checkout')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Your Cart (2)', exact: true })).not.toBeVisible()

    for (const width of [768, 390]) {
      await page.setViewportSize({ width, height: 844 })
      const header = page.getByRole('navigation', { name: 'Mobile header controls' })
      await expect(header).toBeVisible()
      for (const label of ['Open search', 'Open cart', 'Open user menu']) {
        const button = header.getByRole('button', { name: label, exact: true })
        const box = await button.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      }
    }
    await page.getByRole('button', { name: 'Open search', exact: true }).click()
    palette = page.getByRole('dialog', { name: 'Search', exact: true })
    await palette.getByRole('textbox', { name: 'Search input' }).fill(term)
    await expect(palette.getByRole('link', { name: new RegExp(title) })).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: 'Open search', exact: true })).toBeFocused()
    await page.getByRole('button', { name: 'Open user menu', exact: true }).click()
    const account = page.getByRole('dialog', { name: 'Your account' })
    await expect(account.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/auth/signin')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Open navigation menu' }).click()
    const menu = page.getByRole('dialog', { name: 'Mobile navigation' })
    await expect(menu.getByRole('link', { name: 'Create account', exact: true })).toHaveAttribute('href', '/register')
    await menu.getByRole('link', { name: 'Book a Session', exact: true }).click()
    await expect(menu).not.toBeVisible()
    await expect(page).toHaveURL(/\/services$/, { timeout: 30_000 })
  } finally {
    if (articleId) {
      const current = await editor.request.get(`/api/admin/blog?id=${articleId}`)
      if (current.ok()) {
        const saved = (await current.json()).data
        if (saved.published) await editor.request.patch('/api/admin/blog', { data: { id: articleId, version: saved.version, changes: { published: false } } })
      }
    }
    await editor.close()
  }
})

test('account navigation follows real session roles and signs out through Auth.js on desktop and mobile', async ({ page }) => {
  test.setTimeout(240_000)
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  for (const role of ['USER', 'HEALER', 'ADMIN']) {
    const email = `nav-${role.toLowerCase()}-${token}@example.test`
    expect((await page.goto(`/api/test/login?role=${role}&email=${email}`))?.ok()).toBeTruthy()
    await page.goto('/')
    await page.getByRole('button', { name: 'Open user menu', exact: true }).click()
    const account = page.getByRole('dialog', { name: 'Your account' })
    await expect(account.getByText(email, { exact: true })).toBeVisible({ timeout: 30_000 })
    const label = role === 'ADMIN' ? 'Admin dashboard' : role === 'HEALER' ? 'Healer dashboard' : 'Dashboard'
    await expect(account.getByRole('link', { name: label, exact: true })).toHaveAttribute('href', role === 'ADMIN' ? '/admin' : role === 'HEALER' ? '/healer' : '/dashboard')
    if (role !== 'ADMIN') await expect(account.getByRole('link', { name: 'Admin dashboard' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(account).not.toBeVisible()
  }
  await page.getByRole('button', { name: 'Open user menu', exact: true }).click()
  const signedOut = page.waitForResponse(response => response.url().endsWith('/api/auth/signout') && response.request().method() === 'POST')
  await page.getByRole('dialog', { name: 'Your account' }).getByRole('button', { name: 'Sign out', exact: true }).click()
  expect((await signedOut).ok()).toBeTruthy()
  await expect(page.getByRole('dialog', { name: 'Your account' })).not.toBeVisible({ timeout: 30_000 })
  expect((await page.request.get('/api/notifications')).status()).toBe(401)
  await page.getByRole('button', { name: 'Open user menu', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Your account' }).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  expect((await page.goto(`/api/test/login?role=USER&email=nav-mobile-${token}@example.test`))?.ok()).toBeTruthy()
  await page.goto('/')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  const mobile = page.getByRole('dialog', { name: 'Mobile navigation' })
  await expect(mobile.getByRole('link', { name: 'Dashboard', exact: true })).toHaveAttribute('href', '/dashboard')
  await mobile.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(mobile).not.toBeVisible({ timeout: 30_000 })
  expect((await page.request.get('/api/notifications')).status()).toBe(401)
  await page.getByRole('button', { name: 'Open navigation menu' }).click()
  await expect(page.getByRole('dialog', { name: 'Mobile navigation' }).getByRole('link', { name: 'Sign in', exact: true })).toBeVisible()
})
