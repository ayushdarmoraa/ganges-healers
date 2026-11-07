import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { optimizationConfig } from '@/lib/analytics/optimization-config'

/**
 * GET /api/cron/cleanup-events
 *
 * Weekly cron that deletes FunnelEvent rows older than the retention window.
 * Only deletes events that have already been aggregated into DailyFunnelStats.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET?.trim() || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const retentionDays = optimizationConfig.retention.eventRetentionDays
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

    const result = await prisma.funnelEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    })

    console.log(`[cron/cleanup-events] Deleted ${result.count} events older than ${retentionDays} days`)

    return NextResponse.json({
      ok: true,
      deletedCount: result.count,
      cutoffDate: cutoff.toISOString(),
      retentionDays,
    })
  } catch (err) {
    console.error('[cron/cleanup-events] Error:', err)
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 })
  }
}
