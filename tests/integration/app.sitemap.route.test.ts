jest.mock('@/lib/seo/sitemap', () => ({
  getSitemapItems: jest.fn(async () => ([
    { url: 'https://example.com/services/yoga', changeFrequency: 'weekly', priority: 0.8, lastModified: new Date('2024-01-01') },
    { url: 'https://example.com/programs/foundation-6-week', changeFrequency: 'monthly', priority: 0.8 },
    { url: 'https://example.com/healers/anita-sharma', changeFrequency: 'weekly', priority: 0.8 },
  ]))
}))

describe('app sitemap route', () => {
  const OLD = process.env.NEXT_PUBLIC_SITE_URL
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com'
  })
  afterAll(() => { process.env.NEXT_PUBLIC_SITE_URL = OLD })

  it('returns roots and dynamic items with no query params', async () => {
    const sitemap = (await import('@/app/sitemap')).default
    const items = await sitemap()
    const urls = items.map(i => i.url)
    expect(urls).toEqual(expect.arrayContaining([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/services/yoga',
      'https://example.com/programs/foundation-6-week',
      'https://example.com/healers/anita-sharma',
    ]))
    // No query params allowed
    expect(items.every(i => !i.url.includes('?'))).toBe(true)
    // Types check: each item must have url
    for (const it of items) expect(typeof it.url).toBe('string')
  })
})
