import { getSitemapItems } from '@/lib/seo/sitemap'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: { findMany: jest.fn(async () => ([{ slug: 'yoga', updatedAt: new Date('2024-01-01') }])) },
    program: { findMany: jest.fn(async () => ([{ slug: 'foundation-6-week' }])) },
    healer: { findMany: jest.fn(async () => ([{ id: 'h1', slug: 'anita-sharma' }])) },
  }
}))

describe('seo sitemap helper', () => {
  const OLD = process.env.NEXT_PUBLIC_SITE_URL
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://ganges-healers.vercel.app'
  })
  afterAll(() => {
    process.env.NEXT_PUBLIC_SITE_URL = OLD
  })

  it('builds absolute canonical URLs with metadata for services/programs/healers + lists', async () => {
    const items = await getSitemapItems()
    const urls = items.map(i => i.url)
    expect(urls).toEqual(expect.arrayContaining([
      'https://ganges-healers.vercel.app/services/yoga',
      'https://ganges-healers.vercel.app/programs/foundation-6-week',
      'https://ganges-healers.vercel.app/healers/anita-sharma',
      'https://ganges-healers.vercel.app/services',
      'https://ganges-healers.vercel.app/programs',
      'https://ganges-healers.vercel.app/healers',
    ]))
    for (const it of items) {
      expect(typeof it.url).toBe('string')
      expect(it.url.startsWith('https://')).toBe(true)
      expect(it.url.includes('?')).toBe(false)
      expect(it.changeFrequency).toBeDefined()
      expect(it.priority).toBeDefined()
      expect(it.lastModified).toBeDefined()
    }
  })
})
