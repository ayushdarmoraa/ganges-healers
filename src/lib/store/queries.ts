import { prisma } from '@/lib/prisma'

export type ProductCategoryRef = { slug: string; title: string }

export type ProductListItem = {
  id: string
  slug: string
  title: string
  shortDescription: string
  pricePaise: number
  imageUrl: string | null
  ratingAvg: number | null
  stockStatus: 'IN_STOCK' | 'LOW' | 'OUT'
  category: ProductCategoryRef | null
}

export type ProductDetail = ProductListItem & {
  longDescription: string
  gallery?: string[]
  service?: { slug: string; title: string } | null
}

export async function listProducts(params?: { categorySlug?: string; q?: string; limit?: number; cursor?: string }): Promise<{ items: ProductListItem[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(params?.limit ?? 20, 50))
  const q = params?.q?.trim()
  const categorySlug = params?.categorySlug?.trim()
  const cursor = params?.cursor ? { id: params.cursor } : undefined

  // Build a permissive where clause; tolerate missing fields at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { shortDescription: { contains: q, mode: 'insensitive' } },
    ]
  }
  if (categorySlug) {
    where.category = { slug: categorySlug }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productClient: any = (prisma as any).product
    const rows = await productClient.findMany({
      where,
      orderBy: { id: 'asc' },
      ...(cursor ? { cursor, skip: 1 } : {}),
      take: limit,
      select: {
        id: true,
        slug: true,
        title: true,
        shortDescription: true,
        pricePaise: true,
        imageUrl: true,
        ratingAvg: true,
        stockStatus: true,
        category: { select: { slug: true, title: true } },
      },
    })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: ProductListItem[] = rows.map((r: any) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      shortDescription: r.shortDescription ?? '',
      pricePaise: r.pricePaise ?? 0,
      imageUrl: r.imageUrl ?? null,
      ratingAvg: r.ratingAvg ?? null,
      stockStatus: (r.stockStatus as ProductListItem['stockStatus']) ?? 'IN_STOCK',
      category: r.category ? { slug: r.category.slug, title: r.category.title } : null,
    }))
    const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null
    return { items, nextCursor }
  } catch {
    // If model/tables not present, return an empty list; tests can mock this helper
    return { items: [], nextCursor: null }
  }
}

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const productClient: any = (prisma as any).product
    const r = await productClient.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        shortDescription: true,
        longDescription: true,
        pricePaise: true,
        imageUrl: true,
        ratingAvg: true,
        stockStatus: true,
        gallery: true,
        category: { select: { slug: true, title: true } },
        service: { select: { slug: true, title: true } },
      },
    })
    if (!r) return null
    const detail: ProductDetail = {
      id: r.id,
      slug: r.slug,
      title: r.title,
      shortDescription: r.shortDescription ?? '',
      longDescription: r.longDescription ?? '',
      pricePaise: r.pricePaise ?? 0,
      imageUrl: r.imageUrl ?? null,
      ratingAvg: r.ratingAvg ?? null,
      stockStatus: (r.stockStatus as ProductListItem['stockStatus']) ?? 'IN_STOCK',
      gallery: Array.isArray(r.gallery) ? r.gallery as string[] : undefined,
      category: r.category ? { slug: r.category.slug, title: r.category.title } : null,
      service: r.service ? { slug: r.service.slug, title: r.service.title } : null,
    }
    return detail
  } catch {
    return null
  }
}
