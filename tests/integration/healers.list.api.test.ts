/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'

const db = {
  healers: [] as any[],
  services: [] as any[],
}

const prismaMock = {
  service: {
    findUnique: async ({ where }: any) => db.services.find((s) => s.slug === where.slug) || null,
    findMany: async () => db.services.slice(),
  },
  healer: {
    findMany: async (args: any) => {
      let items = db.healers.filter((h) => h.isActive)
      // where filters
      if (args.where?.OR?.length) {
        const or = args.where.OR
        const qTitle = or.find((c: any) => c.user?.name?.contains)?.user?.name?.contains
        const qBio = or.find((c: any) => c.bio?.contains)?.bio?.contains
        const qSpec = or.find((c: any) => c.specializations?.has)?.specializations?.has
        const Q = (qTitle || qBio || qSpec || '').toLowerCase()
        if (Q) {
          items = items.filter((h) => (h.user.name || '').toLowerCase().includes(Q) || (h.bio || '').toLowerCase().includes(Q) || (h.specializations || []).some((s: string) => s.toLowerCase().includes(Q)))
        }
      }
      if (args.where?.AND?.length) {
        const has = args.where.AND.find((c: any) => c.specializations?.has)?.specializations?.has
        if (has) items = items.filter((h) => (h.specializations || []).includes(has))
      }
      if (args.cursor?.id) {
        const idx = items.findIndex((h) => h.id === args.cursor.id)
        if (idx >= 0) items = items.slice(idx + 1)
      }
      items = items.sort((a: any, b: any) => a.id.localeCompare(b.id)).slice(0, args.take)
      return items.map((h) => ({ id: h.id, bio: h.bio, experienceYears: h.experienceYears, rating: h.rating, specializations: h.specializations, user: h.user }))
    },
  },
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

let List: any

function get(url: string) { return new NextRequest(new Request(url)) }

describe('Healers list API', () => {
  beforeAll(async () => {
    List = await import('@/app/api/healers/route')
    // seed services
    db.services.push({ slug: 'yoga-healing', name: 'Yoga Therapy' })
    db.services.push({ slug: 'reiki-healing', name: 'Reiki Healing' })
    // seed healers
    db.healers.push({ id: 'h1', user: { name: 'Alice' }, bio: 'Yoga expert', experienceYears: 5, rating: 4.8, specializations: ['Yoga'], isActive: true })
    db.healers.push({ id: 'h2', user: { name: 'Bob' }, bio: 'Reiki specialist', experienceYears: 3, rating: 4.5, specializations: ['Reiki'], isActive: true })
    db.healers.push({ id: 'h3', user: { name: 'Cara' }, bio: 'Mixed modalities', experienceYears: 10, rating: 4.9, specializations: ['Yoga','Reiki'], isActive: true })
  })

  test('GET /api/healers → returns items with shape and nextCursor', async () => {
    const res = await List.GET(get('http://localhost/api/healers'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.items)).toBe(true)
    const it = json.items[0]
    expect(typeof it.id).toBe('string')
    expect(typeof it.slug).toBe('string')
    expect(typeof it.name).toBe('string')
    expect('title' in it).toBe(true)
    expect(typeof it.yearsExperience).toBe('number')
    expect(typeof it.ratingAvg).toBe('number')
    expect('avatarUrl' in it).toBe(true)
    expect('shortBio' in it).toBe(true)
    expect(Array.isArray(it.services)).toBe(true)
    expect('nextCursor' in json).toBe(true)
  })

  test('q search filters by name/bio/spec', async () => {
    const res = await List.GET(get('http://localhost/api/healers?q=Yoga'))
    const json = await res.json()
    expect(json.items.every((h: any) => /yoga/i.test(h.name + ' ' + h.shortBio) || h.services.some((s: any) => /yoga/i.test(s.title)))).toBe(true)
  })

  test('serviceSlug filter maps to specialization', async () => {
    const res = await List.GET(get('http://localhost/api/healers?serviceSlug=yoga-healing'))
    const json = await res.json()
    expect(json.items.every((h: any) => h.services.some((s: any) => s.slug === 'yoga-healing'))).toBe(true)
  })

  test('limit + cursor pagination', async () => {
    const res1 = await List.GET(get('http://localhost/api/healers?limit=2'))
    const j1 = await res1.json()
    expect(j1.items.length).toBe(2)
    expect(j1.nextCursor).toBeTruthy()
    const res2 = await List.GET(get(`http://localhost/api/healers?limit=2&cursor=${j1.nextCursor}`))
    const j2 = await res2.json()
    expect(j2.items.length).toBeGreaterThanOrEqual(1)
  })
})
