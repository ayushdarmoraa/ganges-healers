import { getSitemapItems } from '@/lib/seo/sitemap'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    service: { findMany: jest.fn(async () => ([{ slug: 'yoga', updatedAt: new Date('2024-01-01') }])) },
    program: { findMany: jest.fn(async () => ([{ slug: 'foundation-6-week' }])) },
    healer: { findMany: jest.fn(async () => ([{ id: 'h1' }])) },
    course: { findMany: jest.fn(async () => ([{ slug: 'intro-meditation', updatedAt: new Date('2024-02-01') }])) },
    product: { findMany: jest.fn(async () => ([{ slug: 'himalayan-salt-lamp', updatedAt: new Date('2024-03-01') }])) },
    blogPost: { findMany: jest.fn(async () => ([{ slug: 'benefits-of-yoga', updatedAt: new Date('2024-04-01') }])) },
    audioTrack: { findMany: jest.fn(async () => ([{ slug: 'morning-meditation', createdAt: new Date('2024-05-01') }])) },
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
      'https://ganges-healers.vercel.app/healers/h1',
      'https://ganges-healers.vercel.app/services',
      'https://ganges-healers.vercel.app/programs',
      'https://ganges-healers.vercel.app/healers',
      'https://ganges-healers.vercel.app/courses',
      'https://ganges-healers.vercel.app/courses/intro-meditation',
      'https://ganges-healers.vercel.app/store',
      'https://ganges-healers.vercel.app/store/himalayan-salt-lamp',
      'https://ganges-healers.vercel.app/blog',
      'https://ganges-healers.vercel.app/blog/benefits-of-yoga',
      'https://ganges-healers.vercel.app/audio',
      'https://ganges-healers.vercel.app/audio/morning-meditation',
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
