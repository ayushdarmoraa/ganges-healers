import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import {
  analyzeDropOffs,
  detectFailurePatterns,
  generateSuggestions,
  maybeAutoExperiment,
  computePriorities,
} from '@/lib/analytics/funnel-intelligence'

/**
 * GET /api/admin/funnel-analysis?days=30&chakra=Heart&source=quiz&variant=product_headline:A
 *
 * Deterministic session-based funnel engine.
 *
 * Algorithm:
 *  1. Fetch all events with a sessionId in the window.
 *  2. Per session, compute the FIRST occurrence of each stage event.
 *  3. Validate flow ordering — a later stage only counts if all prior stages exist
 *     and occurred in chronological order.
 *  4. Compute step-by-step conversion rates from valid sessions only.
 *  5. Segment by chakra, source, experimentVariant.
 *
 * Unit of analysis: sessionId (not userId, not raw events).
 */

const FUNNEL_STAGES = [
  'quiz_start',
  'quiz_complete',
  'product_view',
  'add_to_cart',
  'checkout_start',
  'purchase',
] as const

type Stage = (typeof FUNNEL_STAGES)[number]

/** Per-session truth table: first occurrence timestamp of each stage (or null). */
interface SessionRow {
  sessionId: string
  chakra: string
  source: string
  variant: string
  stages: Record<Stage, Date | null>
}

/** Stage counts + rates for a funnel segment. */
interface FunnelResult {
  quiz_start: number
  quiz_complete: number
  product_view: number
  add_to_cart: number
  checkout_start: number
  purchase: number
  rates: {
    quiz_to_complete: number
    complete_to_view: number
    view_to_cart: number
    cart_to_checkout: number
    checkout_to_purchase: number
  }
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

    // Keep FIRST occurrence only
    const existing = row.stages[stage]
    if (!existing || e.createdAt < existing) {
      row.stages[stage] = e.createdAt
    }

    // Use first non-null segment values
    if (e.chakra && row.chakra === 'unknown') row.chakra = e.chakra
    if (e.source && row.source === 'direct') row.source = e.source
    if (e.experimentVariant && row.variant === 'unknown') row.variant = e.experimentVariant
  }

  return Array.from(map.values())
}

/**
 * Validates flow ordering and computes stage counts.
 *
 * Rules:
 *  - quiz_complete only counts if quiz_start exists and quiz_start < quiz_complete
 *  - product_view only counts if quiz_complete is valid (or is excluded from main funnel)
 *  - add_to_cart only counts if product_view exists
 *  - checkout_start only counts if add_to_cart exists
 *  - purchase only counts if checkout_start exists
 *
 * Sessions that enter mid-funnel (e.g., direct product_view without quiz) are EXCLUDED
 * from the main funnel to avoid corrupting conversion rates.
 */
function computeFunnel(rows: SessionRow[]): FunnelResult {
  const counts: Record<Stage, number> = {
    quiz_start: 0,
    quiz_complete: 0,
    product_view: 0,
    add_to_cart: 0,
    checkout_start: 0,
    purchase: 0,
  }

  for (const row of rows) {
    const s = row.stages

    // Must start with quiz_start to be part of the main funnel
    if (!s.quiz_start) continue
    counts.quiz_start++

    if (!s.quiz_complete || s.quiz_complete < s.quiz_start) continue
    counts.quiz_complete++

    if (!s.product_view || s.product_view < s.quiz_complete) continue
    counts.product_view++

    if (!s.add_to_cart || s.add_to_cart < s.product_view) continue
    counts.add_to_cart++

    if (!s.checkout_start || s.checkout_start < s.add_to_cart) continue
    counts.checkout_start++

    if (!s.purchase || s.purchase < s.checkout_start) continue
    counts.purchase++
  }

  const pct = (num: number, den: number) =>
    den > 0 ? +((num / den) * 100).toFixed(1) : 0

  return {
    ...counts,
    rates: {
      quiz_to_complete: pct(counts.quiz_complete, counts.quiz_start),
      complete_to_view: pct(counts.product_view, counts.quiz_complete),
      view_to_cart: pct(counts.add_to_cart, counts.product_view),
      cart_to_checkout: pct(counts.checkout_start, counts.add_to_cart),
      checkout_to_purchase: pct(counts.purchase, counts.checkout_start),
    },
  }
}

function groupBy<K extends string>(
  rows: SessionRow[],
  key: (r: SessionRow) => K,
): Record<string, FunnelResult> {
  const groups = new Map<string, SessionRow[]>()
  for (const r of rows) {
    const k = key(r)
    const arr = groups.get(k) ?? []
    arr.push(r)
    groups.set(k, arr)
  }
  const result: Record<string, FunnelResult> = {}
  for (const [k, arr] of groups) {
    result[k] = computeFunnel(arr)
  }
  return result
}

export async function GET(req: Request) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 7, 1), 30)
  const chakraFilter = searchParams.get('chakra') || undefined
  const sourceFilter = searchParams.get('source') || undefined
  const variantFilter = searchParams.get('variant') || undefined

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    // Step 1: Fetch all funnel events with a sessionId
    const where: Record<string, unknown> = {
      createdAt: { gte: since },
      sessionId: { not: null },
      type: { in: [...FUNNEL_STAGES] },
    }
    if (chakraFilter) where.chakra = chakraFilter
    if (sourceFilter) where.source = sourceFilter
    if (variantFilter) where.experimentVariant = variantFilter

    const events = await prisma.funnelEvent.findMany({
      where: where as never,
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

    // Step 2: Build per-session truth table (first occurrence per stage)
    const rows = buildSessionRows(events)

    // Step 3+4: Compute validated funnel
    const overall = computeFunnel(rows)

    // Step 5: Segmented funnels
    const byChakra = groupBy(rows, (r) => r.chakra)
    const bySource = groupBy(rows, (r) => r.source)
    const byVariant = groupBy(rows, (r) => r.variant)

    // Overall conversion: quiz_start → purchase
    const overallConversion =
      overall.quiz_start > 0
        ? +((overall.purchase / overall.quiz_start) * 100).toFixed(1)
        : 0

    // Worst drop-off point
    const steps = [
      { from: 'quiz_start', to: 'quiz_complete', rate: overall.rates.quiz_to_complete },
      { from: 'quiz_complete', to: 'product_view', rate: overall.rates.complete_to_view },
      { from: 'product_view', to: 'add_to_cart', rate: overall.rates.view_to_cart },
      { from: 'add_to_cart', to: 'checkout_start', rate: overall.rates.cart_to_checkout },
      { from: 'checkout_start', to: 'purchase', rate: overall.rates.checkout_to_purchase },
    ]
    const worstStep = steps
      .filter((s) => s.rate < 100)
      .sort((a, b) => a.rate - b.rate)[0] ?? null

    // ── Intelligence Layers ──────────────────────────────
    const dropOffAnalysis = analyzeDropOffs(rows)
    const patterns = await detectFailurePatterns(rows, since)

    // Build variant summary for suggestion engine
    const variantSummary: Record<string, { purchase: number; quiz_start: number }> = {}
    for (const [k, v] of Object.entries(byVariant)) {
      variantSummary[k] = { purchase: v.purchase, quiz_start: v.quiz_start }
    }

    const suggestions = generateSuggestions(dropOffAnalysis, patterns, variantSummary)
    const autoExperiments = await maybeAutoExperiment(dropOffAnalysis)
    const priorities = await computePriorities(dropOffAnalysis, since)

    const response = NextResponse.json({
      days,
      filters: {
        chakra: chakraFilter ?? null,
        source: sourceFilter ?? null,
        variant: variantFilter ?? null,
      },
      totalSessions: rows.length,
      overall,
      overallConversion,
      worstDropOff: worstStep
        ? { from: worstStep.from, to: worstStep.to, conversionRate: worstStep.rate, dropOffPct: +(100 - worstStep.rate).toFixed(1) }
        : null,
      byChakra,
      bySource,
      byVariant,
      dropOffAnalysis,
      patterns,
      suggestions,
      autoExperiments,
      priorities,
    })
    // Cache heavy analytics for 60s to prevent repeated DB hits
    response.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=30')
    return response
  } catch (err) {
    console.error('[funnel-analysis] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
