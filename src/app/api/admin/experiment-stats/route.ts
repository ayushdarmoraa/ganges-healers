import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/experiment-stats?key=product_headline
 *
 * Returns per-variant performance metrics for an experiment.
 * When no key is given, returns stats for all experiments.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const experimentKey = searchParams.get('key') // optional

  try {
    // 1. Impressions per variant from FunnelEvent (product_view events with experimentVariant)
    const impressionWhere = {
      type: 'product_view',
      experimentVariant: experimentKey
        ? { startsWith: `${experimentKey}:` }
        : { not: null },
    } as const

    const impressions = await prisma.funnelEvent.groupBy({
      by: ['experimentVariant'],
      where: impressionWhere,
      _count: true,
    })

    // 2. Add-to-cart events per variant
    const addToCartWhere = {
      type: 'add_to_cart',
      experimentVariant: experimentKey
        ? { startsWith: `${experimentKey}:` }
        : { not: null },
    } as const

    const addToCarts = await prisma.funnelEvent.groupBy({
      by: ['experimentVariant'],
      where: addToCartWhere,
      _count: true,
    })

    // 3. Purchase events per variant
    const purchaseWhere = {
      type: 'purchase',
      experimentVariant: experimentKey
        ? { startsWith: `${experimentKey}:` }
        : { not: null },
    } as const

    const purchases = await prisma.funnelEvent.groupBy({
      by: ['experimentVariant'],
      where: purchaseWhere,
      _count: true,
    })

    // 4. Revenue per variant from Order table
    // For backward compat: Order.experimentVariant stores "A" or "B" directly for older data
    const orderRevenue = await prisma.order.groupBy({
      by: ['experimentVariant'],
      _sum: { totalPaise: true },
      _count: true,
      where: {
        status: { not: 'pending_payment' },
        experimentVariant: { not: null },
      },
    })

    // Build a unified map
    const variantMap = new Map<string, {
      variant: string
      impressions: number
      addToCart: number
      purchases: number
      revenue: number
      orders: number
    }>()

    const ensure = (v: string) => {
      if (!variantMap.has(v)) {
        variantMap.set(v, { variant: v, impressions: 0, addToCart: 0, purchases: 0, revenue: 0, orders: 0 })
      }
      return variantMap.get(v)!
    }

    for (const row of impressions) {
      if (!row.experimentVariant) continue
      ensure(row.experimentVariant).impressions = row._count
    }
    for (const row of addToCarts) {
      if (!row.experimentVariant) continue
      ensure(row.experimentVariant).addToCart = row._count
    }
    for (const row of purchases) {
      if (!row.experimentVariant) continue
      ensure(row.experimentVariant).purchases = row._count
    }
    for (const row of orderRevenue) {
      if (!row.experimentVariant) continue
      ensure(row.experimentVariant).revenue = (row._sum.totalPaise ?? 0) / 100
      ensure(row.experimentVariant).orders = row._count
    }

    // Compute rates
    const stats = Array.from(variantMap.values()).map((v) => ({
      variant: v.variant,
      impressions: v.impressions,
      addToCartRate: v.impressions > 0 ? +(v.addToCart / v.impressions * 100).toFixed(2) : 0,
      purchaseRate: v.impressions > 0 ? +(v.purchases / v.impressions * 100).toFixed(2) : 0,
      revenue: v.revenue,
      orders: v.orders,
      revenuePerUser: v.impressions > 0 ? +(v.revenue / v.impressions).toFixed(2) : 0,
    }))

    return NextResponse.json({ experimentKey: experimentKey ?? 'all', stats })
  } catch (err) {
    console.error('[experiment-stats] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
