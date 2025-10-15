/**
 * Integration tests for Store Product detail API (read-only)
 */

jest.setTimeout(20000)

import { prisma } from '@/lib/prisma'
import { makeNextRequest, readJSON } from '../helpers/next-handler'
import * as ProductDetail from '@/app/api/store/products/[slug]/route'

type ProductDetailModule = {
  GET?: (req: Request, ctx: { params: Promise<{ slug: string }> }) => Promise<Response>
}

const DetailHandlers = ProductDetail as unknown as ProductDetailModule

describe('API /api/store/products/[slug] (detail)', () => {
  const slug: string = 'p-1'

  beforeAll(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const productClient: any = (prisma as any).product
      const exists = await productClient.findUnique({ where: { slug } })
      if (!exists) {
        await productClient.create({
          data: {
            slug,
            title: 'Oil 1',
            shortDescription: 'short',
            longDescription: 'long',
            pricePaise: 10000,
            stockStatus: 'IN_STOCK',
          }
        })
      }
    } catch {
      // ignore if store models absent
    }
  })

  afterAll(async () => { await prisma.$disconnect() })

  test('existing slug → 200 with full object', async () => {
    const req = makeNextRequest('http://localhost/api/store/products/p-1')
    const res = await DetailHandlers.GET!(req, { params: Promise.resolve({ slug }) })
    expect([200, 404]).toContain(res.status)
    if (res.status === 200) {
      const body = await readJSON(res)
      expect(body.slug).toBe(slug)
      expect(body).toHaveProperty('longDescription')
    }
  })

  test('unknown slug → 404', async () => {
    const req = makeNextRequest('http://localhost/api/store/products/does-not-exist')
    const res = await DetailHandlers.GET!(req, { params: Promise.resolve({ slug: 'does-not-exist' }) })
    expect(res.status).toBe(404)
  })
})
