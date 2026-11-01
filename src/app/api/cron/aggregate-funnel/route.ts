import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/cron/aggregate-funnel
 *
 * Daily cron that pre-aggregates FunnelEvent counts into DailyFunnelStats.
 * Aggregates the previous day's data (UTC).
 * Idempotent — uses upsert, safe to re-run.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET?.trim() || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Aggregate yesterday (UTC)
    const now = new Date()
    const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1))
    const dayAfter = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))

    // Count events by type for yesterday
    const counts = await prisma.funnelEvent.groupBy({
      by: ['type'],
      where: {
        createdAt: { gte: yesterday, lt: dayAfter },
        sessionId: { not: null },
      },
      _count: { id: true },
    })

    const countMap: Record<string, number> = {}
    for (const row of counts) {
      countMap[row.type] = row._count.id
    }

    // Count distinct sessions
    const sessionCount = await prisma.funnelEvent.findMany({
      where: {
        createdAt: { gte: yesterday, lt: dayAfter },
        sessionId: { not: null },
      },
      select: { sessionId: true },
      distinct: ['sessionId'],
    })

    await prisma.dailyFunnelStats.upsert({
      where: { date: yesterday },
      create: {
        date: yesterday,
        quizStart: countMap['quiz_start'] ?? 0,
        quizComplete: countMap['quiz_complete'] ?? 0,
        productView: countMap['product_view'] ?? 0,
        addToCart: countMap['add_to_cart'] ?? 0,
        checkoutStart: countMap['checkout_start'] ?? 0,
        purchase: countMap['purchase'] ?? 0,
        totalSessions: sessionCount.length,
      },
      update: {
        quizStart: countMap['quiz_start'] ?? 0,
        quizComplete: countMap['quiz_complete'] ?? 0,
        productView: countMap['product_view'] ?? 0,
        addToCart: countMap['add_to_cart'] ?? 0,
        checkoutStart: countMap['checkout_start'] ?? 0,
        purchase: countMap['purchase'] ?? 0,
        totalSessions: sessionCount.length,
      },
    })

    return NextResponse.json({
      ok: true,
      date: yesterday.toISOString().slice(0, 10),
      stats: {
        quizStart: countMap['quiz_start'] ?? 0,
        quizComplete: countMap['quiz_complete'] ?? 0,
        productView: countMap['product_view'] ?? 0,
        addToCart: countMap['add_to_cart'] ?? 0,
        checkoutStart: countMap['checkout_start'] ?? 0,
        purchase: countMap['purchase'] ?? 0,
        totalSessions: sessionCount.length,
      },
    })
  } catch (err) {
    console.error('[cron/aggregate-funnel] Error:', err)
    return NextResponse.json({ error: 'Aggregation failed' }, { status: 500 })
  }
}
