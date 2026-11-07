import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/cohorts?days=30
 *
 * Groups users by the day of their first event.
 * For each cohort, tracks % who purchased within 1, 3, and 7 days.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 30, 1), 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    // Get all events in the window grouped by identity (userId || sessionId)
    const events = await prisma.funnelEvent.findMany({
      where: { createdAt: { gte: since } },
      select: { type: true, userId: true, sessionId: true, createdAt: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })

    // Build per-identity records: first event date + purchase dates
    interface UserRecord {
      firstEventAt: Date
      purchaseDates: Date[]
    }
    const users = new Map<string, UserRecord>()

    for (const e of events) {
      const key = e.userId || e.sessionId
      if (!key) continue

      const record = users.get(key)
      if (!record) {
        users.set(key, {
          firstEventAt: e.createdAt,
          purchaseDates: e.type === 'purchase' ? [e.createdAt] : [],
        })
      } else {
        if (e.type === 'purchase') {
          record.purchaseDates.push(e.createdAt)
        }
      }
    }

    // Group into daily cohorts
    const DAY_MS = 24 * 60 * 60 * 1000
    interface Cohort {
      date: string
      total: number
      purchasedWithin1d: number
      purchasedWithin3d: number
      purchasedWithin7d: number
    }
    const cohortMap = new Map<string, Cohort>()

    for (const [, record] of users) {
      const dateKey = record.firstEventAt.toISOString().slice(0, 10)
      const cohort = cohortMap.get(dateKey) ?? {
        date: dateKey,
        total: 0,
        purchasedWithin1d: 0,
        purchasedWithin3d: 0,
        purchasedWithin7d: 0,
      }

      cohort.total++

      // Check if any purchase falls within the windows
      for (const pd of record.purchaseDates) {
        const delta = pd.getTime() - record.firstEventAt.getTime()
        if (delta <= 1 * DAY_MS) { cohort.purchasedWithin1d++; cohort.purchasedWithin3d++; cohort.purchasedWithin7d++; break }
        if (delta <= 3 * DAY_MS) { cohort.purchasedWithin3d++; cohort.purchasedWithin7d++; break }
        if (delta <= 7 * DAY_MS) { cohort.purchasedWithin7d++; break }
      }

      cohortMap.set(dateKey, cohort)
    }

    const cohorts = Array.from(cohortMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((c) => ({
        ...c,
        pct1d: c.total > 0 ? +(c.purchasedWithin1d / c.total * 100).toFixed(1) : 0,
        pct3d: c.total > 0 ? +(c.purchasedWithin3d / c.total * 100).toFixed(1) : 0,
        pct7d: c.total > 0 ? +(c.purchasedWithin7d / c.total * 100).toFixed(1) : 0,
      }))

    return NextResponse.json({ days, cohorts })
  } catch (err) {
    console.error('[cohorts] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
