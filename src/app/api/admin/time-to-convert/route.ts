import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/time-to-convert?days=90
 *
 * Measures the time between quiz_complete and purchase for each converting user.
 * Returns overall avg + breakdowns by chakra and source.
 */
export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 90, 1), 365)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    // Get all quiz_complete events in the window
    const quizEvents = await prisma.funnelEvent.findMany({
      where: { type: 'quiz_complete', createdAt: { gte: since } },
      select: { sessionId: true, userId: true, createdAt: true, chakra: true, source: true },
    })

    // Get all purchase events in the window
    const purchaseEvents = await prisma.funnelEvent.findMany({
      where: { type: 'purchase', createdAt: { gte: since } },
      select: { sessionId: true, userId: true, createdAt: true },
    })

    // Build lookup: earliest purchase per user/session
    const purchaseMap = new Map<string, Date>()
    for (const p of purchaseEvents) {
      const key = p.userId || p.sessionId
      if (!key) continue
      const existing = purchaseMap.get(key)
      if (!existing || p.createdAt < existing) {
        purchaseMap.set(key, p.createdAt)
      }
    }

    // Match quiz → purchase and compute time deltas
    interface ConversionRecord {
      minutes: number
      chakra: string
      source: string
    }
    const conversions: ConversionRecord[] = []

    for (const q of quizEvents) {
      const key = q.userId || q.sessionId
      if (!key) continue
      const purchaseDate = purchaseMap.get(key)
      if (!purchaseDate || purchaseDate < q.createdAt) continue // must be after quiz

      const minutes = (purchaseDate.getTime() - q.createdAt.getTime()) / 60_000
      conversions.push({
        minutes,
        chakra: q.chakra || 'unknown',
        source: q.source || 'direct',
      })
    }

    const avg = (arr: number[]) =>
      arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0

    const median = (arr: number[]) => {
      if (arr.length === 0) return 0
      const sorted = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? Math.round(sorted[mid]) : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    }

    const allMinutes = conversions.map((c) => c.minutes)

    // Group by chakra
    const byChakra = new Map<string, number[]>()
    for (const c of conversions) {
      const arr = byChakra.get(c.chakra) ?? []
      arr.push(c.minutes)
      byChakra.set(c.chakra, arr)
    }

    // Group by source
    const bySource = new Map<string, number[]>()
    for (const c of conversions) {
      const arr = bySource.get(c.source) ?? []
      arr.push(c.minutes)
      bySource.set(c.source, arr)
    }

    const formatGroup = (map: Map<string, number[]>) =>
      Array.from(map.entries())
        .map(([segment, mins]) => ({
          segment,
          conversions: mins.length,
          avgMinutes: avg(mins),
          medianMinutes: median(mins),
          avgHours: +(avg(mins) / 60).toFixed(1),
        }))
        .sort((a, b) => b.conversions - a.conversions)

    const response = NextResponse.json({
      days,
      totalQuizCompletes: quizEvents.length,
      totalConversions: conversions.length,
      conversionRate: quizEvents.length > 0
        ? +(conversions.length / quizEvents.length * 100).toFixed(1)
        : 0,
      overall: {
        avgMinutes: avg(allMinutes),
        medianMinutes: median(allMinutes),
        avgHours: +(avg(allMinutes) / 60).toFixed(1),
      },
      byChakra: formatGroup(byChakra),
      bySource: formatGroup(bySource),
    })
    response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=60')
    return response
  } catch (err) {
    console.error('[time-to-convert] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
