import { prisma } from '@/lib/prisma'
import type { BundleListItem } from '@/lib/store/bundle-queries'

interface BundleContext {
  /** Anonymous session ID from cookie */
  sessionId?: string | null
  /** Authenticated user ID */
  userId?: string | null
  /** Quiz-derived chakra */
  chakra?: string | null
}

interface DynamicBundleResult {
  bundle: BundleListItem | null
  /** Discount percentage to apply (0 = no discount). Clamped to [MIN_DISCOUNT, MAX_DISCOUNT]. */
  discountPct: number
  /** Reason the bundle was recommended. */
  reason: string | null
}

/** Discount guardrails — prevent logic drift from giving unreasonable discounts */
const MIN_DISCOUNT = 5
const MAX_DISCOUNT = 30

function clampDiscount(pct: number): number {
  if (pct <= 0) return 0
  return Math.max(MIN_DISCOUNT, Math.min(MAX_DISCOUNT, pct))
}

/**
 * Smart Bundle Engine.
 *
 * Recommends a bundle with an optional discount based on the user's
 * funnel behavior:
 *  - 2+ product views  → show chakra-matched bundle (5% off)
 *  - Lead score > 40   → show chakra-matched bundle (10% off)
 *  - Otherwise         → no dynamic bundle
 */
export async function getDynamicBundle(ctx: BundleContext): Promise<DynamicBundleResult> {
  const none: DynamicBundleResult = { bundle: null, discountPct: 0, reason: null }

  // We need at least a session or user to look up history
  if (!ctx.sessionId && !ctx.userId) return none

  // Count product views from this session (last 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const viewFilter = {
    type: 'product_view',
    createdAt: { gte: oneDayAgo },
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : { userId: ctx.userId }),
  }

  const [viewCount] = await Promise.all([
    prisma.funnelEvent.count({ where: viewFilter }),
  ])

  // Look up lead score if we have a userId → find their email → quizLead
  let score = 0
  if (ctx.userId) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    })
    if (user?.email) {
      const lead = await prisma.quizLead.findFirst({
        where: { email: user.email.toLowerCase() },
        orderBy: { score: 'desc' },
        select: { score: true },
      })
      score = lead?.score ?? 0
    }
  }

  // Decision tree
  const qualifiesByViews = viewCount >= 2
  const qualifiesByScore = score > 40

  if (!qualifiesByViews && !qualifiesByScore) return none

  // Find a matching bundle
  const bundle = await findBestBundle(ctx.chakra)
  if (!bundle) return none

  if (qualifiesByScore) {
    return { bundle, discountPct: clampDiscount(10), reason: 'high_engagement_score' }
  }

  return { bundle, discountPct: clampDiscount(5), reason: 'multiple_product_views' }
}

/** Find the best active bundle, preferring the user's chakra. */
async function findBestBundle(chakra?: string | null): Promise<BundleListItem | null> {
  const where = {
    isActive: true,
    ...(chakra ? { chakra: { equals: chakra, mode: 'insensitive' as const } } : {}),
  }

  const row = await prisma.productBundle.findFirst({
    where,
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

  if (!row) {
    // Fallback: any active bundle
    if (chakra) return findBestBundle(null)
    return null
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    pricePaise: row.pricePaise,
    chakra: row.chakra,
    items: row.items.map((i) => ({
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
