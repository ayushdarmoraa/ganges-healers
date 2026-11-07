import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/live-funnel
 *
 * Returns live funnel metrics for the admin dashboard.
 * Protected by admin auth.
 */
export async function GET() {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const now = new Date()
  const sixtyMinutesAgo = new Date(now.getTime() - 60 * 60 * 1000)
  const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000)

  try {
    const [
      activeQuizUsers,
      activeCarts,
      recentOrders,
      recentEvents,
      eventBreakdown,
    ] = await Promise.all([
      // Active quiz users: unique sessions with quiz_start or quiz_complete in last 15 min
      prisma.funnelEvent.groupBy({
        by: ['sessionId'],
        where: {
          type: { in: ['quiz_start', 'quiz_complete'] },
          createdAt: { gte: fifteenMinutesAgo },
          sessionId: { not: null },
        },
      }).then((rows) => rows.length),

      // Active carts: unique sessions with add_to_cart in last 60 min
      prisma.funnelEvent.groupBy({
        by: ['sessionId'],
        where: {
          type: 'add_to_cart',
          createdAt: { gte: sixtyMinutesAgo },
          sessionId: { not: null },
        },
      }).then((rows) => rows.length),

      // Orders completed in last 60 min
      prisma.order.count({
        where: {
          createdAt: { gte: sixtyMinutesAgo },
          status: { not: 'pending_payment' },
        },
      }),

      // Total events in last 60 min
      prisma.funnelEvent.count({
        where: { createdAt: { gte: sixtyMinutesAgo } },
      }),

      // Event breakdown by type in last 60 min
      prisma.funnelEvent.groupBy({
        by: ['type'],
        where: { createdAt: { gte: sixtyMinutesAgo } },
        _count: true,
        orderBy: { _count: { type: 'desc' } },
      }),
    ])

    return NextResponse.json({
      ts: now.toISOString(),
      activeQuizUsers,
      activeCarts,
      recentOrders,
      recentEvents,
      eventBreakdown: eventBreakdown.map((e) => ({
        type: e.type,
        count: e._count,
      })),
    })
  } catch (err) {
    console.error('[live-funnel] Query error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
