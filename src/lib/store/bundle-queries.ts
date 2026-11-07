import { prisma } from '@/lib/prisma'

export type BundleListItem = {
  id: string
  slug: string
  title: string
  description: string | null
  pricePaise: number
  chakra: string | null
  items: Array<{
    product: {
      id: string
      slug: string
      title: string
      pricePaise: number
      imageUrl: string | null
    }
  }>
}

/** Get active bundles, optionally filtered by chakra. */
export async function listBundles(chakra?: string): Promise<BundleListItem[]> {
  const rows = await prisma.productBundle.findMany({
    where: {
      isActive: true,
      ...(chakra ? { chakra: { equals: chakra, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, slug: true, title: true, pricePaise: true, imageUrl: true },
          },
        },
      },
    },
  })

  return rows.map((b) => ({
    id: b.id,
    slug: b.slug,
    title: b.title,
    description: b.description,
    pricePaise: b.pricePaise,
    chakra: b.chakra,
    items: b.items.map((i) => ({
      product: {
        id: i.product.id,
        slug: i.product.slug,
        title: i.product.title,
        pricePaise: i.product.pricePaise ?? 0,
        imageUrl: i.product.imageUrl,
      },
    })),
  }))
}

/** Get a single bundle by slug. */
export async function getBundleBySlug(slug: string): Promise<BundleListItem | null> {
  const b = await prisma.productBundle.findUnique({
    where: { slug },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, slug: true, title: true, pricePaise: true, imageUrl: true },
          },
        },
      },
    },
  })
  if (!b || !b.isActive) return null

  return {
    id: b.id,
    slug: b.slug,
    title: b.title,
    description: b.description,
    pricePaise: b.pricePaise,
    chakra: b.chakra,
    items: b.items.map((i) => ({
      product: {
        id: i.product.id,
        slug: i.product.slug,
        title: i.product.title,
        pricePaise: i.product.pricePaise ?? 0,
        imageUrl: i.product.imageUrl,
      },
    })),
  }
}

/** Get recommended bundles for a quiz chakra result. */
export async function getRecommendedBundles(chakra: string): Promise<BundleListItem[]> {
  return listBundles(chakra)
}
