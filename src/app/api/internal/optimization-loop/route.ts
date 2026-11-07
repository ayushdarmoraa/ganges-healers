import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { optimizationConfig } from '@/lib/analytics/optimization-config'
import {
  analyzeDropOffs,
  detectFailurePatterns,
  generateSuggestions,
  maybeAutoExperiment,
  computePriorities,
} from '@/lib/analytics/funnel-intelligence'
import {
  evaluateAllExperiments,
  logOptimization,
} from '@/lib/experiments/lifecycle'

// ── Shared helpers (same as funnel-analysis route) ─────

const FUNNEL_STAGES = [
  'quiz_start',
  'quiz_complete',
  'product_view',
  'add_to_cart',
  'checkout_start',
  'purchase',
] as const

type Stage = (typeof FUNNEL_STAGES)[number]

interface SessionRow {
  sessionId: string
  chakra: string
  source: string
  variant: string
  stages: Record<Stage, Date | null>
}

function buildSessionRows(
  events: Array<{
    type: string
    userId: string | null
    sessionId: string | null
    chakra: string | null
    source: string | null
    experimentVariant: string | null
    createdAt: Date
  }>,
): SessionRow[] {
  const map = new Map<string, SessionRow>()

  for (const e of events) {
    // Hybrid identity: userId takes priority (merges cross-device sessions)
    const identity = e.userId || e.sessionId
    if (!identity) continue
    const stage = e.type as Stage
    if (!FUNNEL_STAGES.includes(stage)) continue

    let row = map.get(identity)
    if (!row) {
      row = {
        sessionId: identity,
        chakra: e.chakra || 'unknown',
        source: e.source || 'direct',
        variant: e.experimentVariant || 'unknown',
        stages: {
          quiz_start: null,
          quiz_complete: null,
          product_view: null,
          add_to_cart: null,
          checkout_start: null,
          purchase: null,
        },
      }
      map.set(identity, row)
    }

    const existing = row.stages[stage]
    if (!existing || e.createdAt < existing) {
      row.stages[stage] = e.createdAt
    }

    if (e.chakra && row.chakra === 'unknown') row.chakra = e.chakra
    if (e.source && row.source === 'direct') row.source = e.source
    if (e.experimentVariant && row.variant === 'unknown') row.variant = e.experimentVariant
  }

  return Array.from(map.values())
}

// ── Route ──────────────────────────────────────────────

/**
 * POST /api/internal/optimization-loop
 *
 * Closed-loop auto-optimization runner.
 * Called by cron (e.g., Vercel Cron) — not by users.
 *
 * Flow:
 *  1. Failsafe: check AUTO_OPTIMIZATION_ENABLED env flag
 *  2. Auth: verify CRON_SECRET bearer token
 *  3. Fetch funnel events for the analysis window
 *  4. Gate: minSessions check
 *  5. Evaluate existing experiments (winner detection / expiry)
 *  6. Analyze drop-offs → generate suggestions → auto-create experiments
 *  7. Compute priorities
 *  8. Log summary to OptimizationLog
 *  9. Return results
 */
export async function POST(req: Request) {
  // ── 1. Failsafe: kill switch ─────────────────────────
  if (process.env.AUTO_OPTIMIZATION_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Auto-optimization is disabled', hint: 'Set AUTO_OPTIMIZATION_ENABLED=true' },
      { status: 503 },
    )
  }

  // ── 2. Auth: CRON_SECRET bearer token ────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || token !== cronSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const { gates, experiments } = optimizationConfig
    const since = new Date(Date.now() - experiments.analysisDays * 24 * 60 * 60 * 1000)

    // ── 3. Fetch funnel events ───────────────────────────
    const events = await prisma.funnelEvent.findMany({
      where: {
        createdAt: { gte: since },
        sessionId: { not: null },
        type: { in: ['quiz_start', 'quiz_complete', 'product_view', 'add_to_cart', 'checkout_start', 'purchase'] },
      },
      select: {
        type: true,
        userId: true,
        sessionId: true,
        chakra: true,
        source: true,
        experimentVariant: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    })

    const rows = buildSessionRows(events)

    // Count sessions that entered the funnel
    const funnelSessions = rows.filter((r) => r.stages.quiz_start !== null).length

    // ── 4. Gate: minimum sessions ────────────────────────
    if (funnelSessions < gates.minSessions) {
      await logOptimization({
        action: 'loop_skipped',
        reason: `Insufficient sessions (${funnelSessions} < ${gates.minSessions})`,
        metrics: { funnelSessions, minRequired: gates.minSessions },
      })

      return NextResponse.json({
        status: 'skipped',
        reason: `Insufficient sessions (${funnelSessions} < ${gates.minSessions})`,
        funnelSessions,
        durationMs: Date.now() - startTime,
      })
    }

    // ── 5. Evaluate existing experiments ─────────────────
    const experimentResults = await evaluateAllExperiments()

    // ── 6. Analyze drop-offs → suggestions → auto-experiments
    const dropOffAnalysis = analyzeDropOffs(rows)
    const patterns = await detectFailurePatterns(rows, since)

    // Build variant summary for suggestion engine
    const variantSummary: Record<string, { purchase: number; quiz_start: number }> = {}
    for (const r of rows) {
      if (!variantSummary[r.variant]) {
        variantSummary[r.variant] = { purchase: 0, quiz_start: 0 }
      }
      if (r.stages.purchase) variantSummary[r.variant].purchase++
      if (r.stages.quiz_start) variantSummary[r.variant].quiz_start++
    }

    const suggestions = generateSuggestions(dropOffAnalysis, patterns, variantSummary)
    const autoExperiments = await maybeAutoExperiment(dropOffAnalysis)

    // ── 7. Compute priorities ────────────────────────────
    const priorities = await computePriorities(dropOffAnalysis, since)

    // ── 8. Log summary ───────────────────────────────────
    const durationMs = Date.now() - startTime

    await logOptimization({
      action: 'loop_completed',
      reason: `Processed ${funnelSessions} sessions in ${durationMs}ms`,
      metrics: {
        funnelSessions,
        analysisDays: experiments.analysisDays,
        dropOffs: dropOffAnalysis.length,
        suggestions: suggestions.length,
        experimentsEvaluated: experimentResults.length,
        experimentsCompleted: experimentResults.filter((e) => e.action !== 'continue').length,
        experimentsCreated: autoExperiments.filter((a) => a.triggered).length,
        topPriority: priorities[0]?.stage ?? null,
        durationMs,
      },
    })

    // ── 9. Return results ────────────────────────────────
    return NextResponse.json({
      status: 'completed',
      durationMs,
      funnelSessions,
      experimentResults,
      dropOffAnalysis,
      suggestions,
      autoExperiments,
      priorities,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    await logOptimization({
      action: 'loop_error',
      reason: message,
    }).catch(() => {}) // Don't let logging failure mask the real error

    return NextResponse.json(
      { error: 'Optimization loop failed', message },
      { status: 500 },
    )
  }
}
