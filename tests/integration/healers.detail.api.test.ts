/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'

const row = { id: 'h1', user: { name: 'Alice' }, bio: 'Long biography about Alice', experienceYears: 7, rating: 4.7, specializations: ['Yoga'], certifications: ['RYT-200'] }

const prismaMock = {
  healer: {
    findUnique: async ({ where }: any) => {
      if (where?.id === row.id) return { ...row }
      return null
    },
  },
  service: {
    findMany: async () => [{ slug: 'yoga-healing', name: 'Yoga Therapy' }],
  },
}

jest.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

let Detail: any

function get(url: string) { return new NextRequest(new Request(url)) }

describe('Healers detail API', () => {
  beforeAll(async () => {
    Detail = await import('@/app/api/healers/[slug]/route')
  })

  test('GET /api/healers/[slug] → 200 with detail shape', async () => {
    const res = await Detail.GET(get('http://localhost/api/healers/h1'), { params: Promise.resolve({ slug: 'h1' }) })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.slug).toBe('h1')
    expect(json.name).toBe('Alice')
    expect(typeof json.longBio).toBe('string')
    expect(Array.isArray(json.certifications)).toBe(true)
    expect(Array.isArray(json.services)).toBe(true)
  })

  test('GET /api/healers/[slug] → 404 when not found', async () => {
    const res = await Detail.GET(get('http://localhost/api/healers/nope'), { params: Promise.resolve({ slug: 'nope' }) })
    expect(res.status).toBe(404)
  })
})
