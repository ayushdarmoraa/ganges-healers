import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/bundle-performance?days=30
 *
 * Bundle conversion funnel: bundle_view → bundle_click → bundle_purchase
 * Broken down by bundle slug (from event metadata).
 */
export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 30, 1), 365)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    const events = await prisma.funnelEvent.findMany({
      where: {
        type: { in: ['bundle_view', 'bundle_click', 'bundle_purchase'] },
        createdAt: { gte: since },
      },
      select: { type: true, metadata: true },
    })

    // Aggregate by bundle slug
    const buckets = new Map<
      string,
      { views: number; clicks: number; purchases: number }
    >()

    for (const e of events) {
      const slug =
        (e.metadata as Record<string, unknown> | null)?.bundleSlug as string | undefined
      const key = slug ?? 'unknown'
      const b = buckets.get(key) ?? { views: 0, clicks: 0, purchases: 0 }
      if (e.type === 'bundle_view') b.views++
      else if (e.type === 'bundle_click') b.clicks++
      else if (e.type === 'bundle_purchase') b.purchases++
      buckets.set(key, b)
    }

    const bundles = Array.from(buckets.entries())
      .map(([slug, stats]) => ({
        slug,
        ...stats,
        clickRate: stats.views > 0 ? +(stats.clicks / stats.views * 100).toFixed(1) : 0,
        purchaseRate: stats.clicks > 0 ? +(stats.purchases / stats.clicks * 100).toFixed(1) : 0,
        overallConversion: stats.views > 0 ? +(stats.purchases / stats.views * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.views - a.views)

    const totals = bundles.reduce(
      (acc, b) => ({
        views: acc.views + b.views,
        clicks: acc.clicks + b.clicks,
        purchases: acc.purchases + b.purchases,
      }),
      { views: 0, clicks: 0, purchases: 0 },
    )

    return NextResponse.json({
      days,
      totals: {
        ...totals,
        clickRate: totals.views > 0 ? +(totals.clicks / totals.views * 100).toFixed(1) : 0,
        purchaseRate: totals.clicks > 0 ? +(totals.purchases / totals.clicks * 100).toFixed(1) : 0,
        overallConversion: totals.views > 0 ? +(totals.purchases / totals.views * 100).toFixed(1) : 0,
      },
      bundles,
    })
  } catch (err) {
    console.error('[bundle-performance] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
