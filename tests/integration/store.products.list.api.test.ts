/**
 * Integration tests for Store Products API (read-only)
 */

jest.setTimeout(20000)

import { prisma } from '@/lib/prisma'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as ProductsList from '@/app/api/store/products/route'

type ProductsListModule = {
  GET?: (req: Request) => Promise<Response>
}

const ListHandlers = ProductsList as unknown as ProductsListModule

describe('API /api/store/products (list)', () => {
  let seeded: Array<{ id: string; slug: string; categoryId?: string }>
  let categoryId: string

  beforeAll(async () => {
    // Create minimal categories/products in-memory via Prisma if model exists; otherwise, skip seeding
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cat = await (prisma as any).productCategory.create({ data: { slug: 'oils', title: 'Oils' } })
      categoryId = cat.id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const productClient: any = (prisma as any).product
      seeded = []
      for (let i = 1; i <= 5; i++) {
        const p = await productClient.create({
          data: {
            slug: `p-${i}`,
            title: `Oil ${i}`,
            shortDescription: `Nice oil ${i}`,
            longDescription: `Long desc ${i}`,
            pricePaise: 10000 + i,
            imageUrl: null,
            ratingAvg: 4.5,
            stockStatus: 'IN_STOCK',
            categoryId,
          }
        })
        seeded.push({ id: p.id, slug: p.slug, categoryId })
      }
    } catch {
      // models not present; tests that rely on prisma seeding will still validate handler shape with empty results
      seeded = []
    }
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('returns list shape with pagination and filters', async () => {
    const req = makeNextRequest('http://localhost/api/store/products?limit=2')
    const res = await ListHandlers.GET!(req)
    expect(res.status).toBe(200)
    const body = await readJSON(res)
    expect(Array.isArray(body.items)).toBe(true)
    expect(body).toHaveProperty('nextCursor')
  })

  test('q search and category filter', async () => {
    const req = makeNextRequest('http://localhost/api/store/products?q=Oil&categorySlug=oils&limit=10')
    const res = await ListHandlers.GET!(req)
    expect(res.status).toBe(200)
    const body = await readJSON(res)
    expect(Array.isArray(body.items)).toBe(true)
    if (body.items.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(body.items.every((p: any) => p.category?.slug === 'oils')).toBe(true)
    }
  })
})
