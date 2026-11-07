import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/revenue-breakdown?days=30
 *
 * Revenue attribution by source, chakra, and experiment variant.
 * Includes AOV (average order value) per segment.
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
    const paidFilter = {
      status: { notIn: ['pending_payment', 'refunded'] },
      createdAt: { gte: since },
    }

    // Revenue by source
    const bySource = await prisma.order.groupBy({
      by: ['source'],
      where: paidFilter,
      _sum: { totalPaise: true },
      _count: { id: true },
    })

    // Revenue by chakra
    const byChakra = await prisma.order.groupBy({
      by: ['chakra'],
      where: paidFilter,
      _sum: { totalPaise: true },
      _count: { id: true },
    })

    // Revenue by experiment variant
    const byVariant = await prisma.order.groupBy({
      by: ['experimentVariant'],
      where: paidFilter,
      _sum: { totalPaise: true },
      _count: { id: true },
    })

    // Overall totals
    const totals = await prisma.order.aggregate({
      where: paidFilter,
      _sum: { totalPaise: true },
      _count: { id: true },
    })

    const totalRevenue = totals._sum.totalPaise ?? 0
    const totalOrders = totals._count.id ?? 0
    const aov = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

    const format = (
      rows: Array<{ _sum: { totalPaise: number | null }; _count: { id: number } } & Record<string, unknown>>,
      key: string,
    ) =>
      rows.map((r) => {
        const rev = r._sum.totalPaise ?? 0
        const cnt = r._count.id
        return {
          segment: (r as Record<string, unknown>)[key] ?? 'unknown',
          revenue: rev,
          orders: cnt,
          aov: cnt > 0 ? Math.round(rev / cnt) : 0,
          pct: totalRevenue > 0 ? +(rev / totalRevenue * 100).toFixed(1) : 0,
        }
      })
      .sort((a, b) => b.revenue - a.revenue)

    const response = NextResponse.json({
      days,
      totalRevenue,
      totalOrders,
      aov,
      bySource: format(bySource, 'source'),
      byChakra: format(byChakra, 'chakra'),
      byVariant: format(byVariant, 'experimentVariant'),
    })
    response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60')
    return response
  } catch (err) {
    console.error('[revenue-breakdown] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
