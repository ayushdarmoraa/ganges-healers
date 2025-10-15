/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'

const db = { programs: [] as any[] }
const cuid = () => 'id_' + Math.random().toString(36).slice(2)

// eslint-disable-next-line prefer-const
let prismaMock: any

jest.mock('@/lib/prisma', () => ({
  get prisma() { return prismaMock }
}))

// Define the mock after jest.mock to avoid hoist/TDZ issues
prismaMock = {
  program: {
    upsert: async (args: any) => {
      const slug = args.where?.slug
      const existing = db.programs.find(p => p.slug === slug)
      if (existing) {
        Object.assign(existing, args.update || {})
        return existing
      }
      const created = { id: cuid(), ...(args.create || {}) }
      db.programs.push(created)
      return created
    },
    findMany: async (args: any) => {
      let items = db.programs.filter(p => p.isActive)
      if (args.where?.OR?.length) {
        const q = args.where.OR[0]?.title?.contains || args.where.OR[1]?.description?.contains
        if (q) {
          const Q = (q as string).toLowerCase()
          items = items.filter(p => p.title.toLowerCase().includes(Q) || p.description.toLowerCase().includes(Q))
        }
      }
      if (args.cursor?.id) {
        const idx = items.findIndex(p => p.id === args.cursor.id)
        if (idx >= 0) items = items.slice(idx + 1)
      }
      items = items.sort((a,b) => a.id.localeCompare(b.id)).slice(0, args.take)
      return items.map(p => ({ id: p.id, slug: p.slug, title: p.title, description: p.description, pricePaise: p.pricePaise, totalSessions: p.totalSessions }))
    },
    findUnique: async () => null,
  }
}

let List: any

function get(url: string) { return new NextRequest(new Request(url)) }

describe('Programs list API', () => {
  beforeAll(async () => {
    // Ensure at least 3 programs for pagination test
    const now = Date.now().toString(36)
    const base = [
      { slug: `foundation-6-week`, title: 'Foundation 6 Week', pricePaise: 100000 },
      { slug: `advanced-4-week`, title: 'Advanced 4 Week', pricePaise: 150000 },
      { slug: `mindfulness-${now}`, title: 'Mindfulness', pricePaise: 120000 },
    ]
    for (const p of base) {
      await prisma.program.upsert({
        where: { slug: p.slug },
        update: { isActive: true },
        create: { slug: p.slug, title: p.title, description: 'desc', pricePaise: p.pricePaise, totalSessions: 6, sessionsPerWeek: 3, durationMinutes: 45, isActive: true },
      })
    }
  })
  beforeAll(async () => {
    List = await import('@/app/api/programs/route')
    // seed
    db.programs.push({ id: cuid(), slug: 'p-yoga', title: 'Yoga Basics', description: 'Intro yoga', pricePaise: 99900, totalSessions: 8, isActive: true })
    db.programs.push({ id: cuid(), slug: 'p-med', title: 'Meditation', description: 'Mindfulness', pricePaise: 49900, totalSessions: 6, isActive: true })
    db.programs.push({ id: cuid(), slug: 'p-run', title: 'Running Form', description: 'Run fast', pricePaise: 29900, totalSessions: 4, isActive: true })
  })

  test('GET /api/programs → returns items, nextCursor', async () => {
    const res = await List.GET(get('http://localhost/api/programs'))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(Array.isArray(json.items)).toBe(true)
    expect('nextCursor' in json).toBe(true)
    const it = json.items[0]
    expect(typeof it.id).toBe('string')
    expect(typeof it.slug).toBe('string')
    expect(typeof it.title).toBe('string')
    expect(typeof it.shortDescription).toBe('string')
    expect(typeof it.sessionsCount).toBe('number')
    expect(typeof it.pricePaise).toBe('number')
  })

  test('q search filters', async () => {
    const res = await List.GET(get('http://localhost/api/programs?q=yoga'))
    const json = await res.json()
    expect(json.items.every((p: any) => /yoga|intro/i.test(p.title + ' ' + p.shortDescription))).toBe(true)
  })

  test('limit and cursor pagination', async () => {
    const res1 = await List.GET(get('http://localhost/api/programs?limit=2'))
    const j1 = await res1.json()
    expect(j1.items.length).toBe(2)
    expect(j1.nextCursor).toBeTruthy()
    const res2 = await List.GET(get(`http://localhost/api/programs?limit=2&cursor=${encodeURIComponent(j1.nextCursor)}`))
    const j2 = await res2.json()
    expect(j2.items.length).toBeGreaterThanOrEqual(1)
  })
})
