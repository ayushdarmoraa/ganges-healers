import { prisma } from '@/lib/prisma'
import { createExperiment } from '@/lib/experiments/create-experiment'
import { optimizationConfig } from '@/lib/analytics/optimization-config'
import {
  countActiveExperiments,
  isInCooldown,
  logOptimization,
} from '@/lib/experiments/lifecycle'

/**
 * Funnel Intelligence Engine
 *
 * Layered analysis on top of the session truth table:
 *  1. Drop-off reason detection — WHERE drops concentrate (segment)
 *  2. Failure pattern detection — WHY drops happen (behavioral signals)
 *  3. Optimization suggestions — WHAT to do (rule-based)
 *  4. Auto-experiment trigger — HOW to test (creates experiments)
 *  5. Priority scoring — WHICH to fix first (revenue impact)
 */

// ── Types ──────────────────────────────────────────────

type Stage =
  | 'quiz_start'
  | 'quiz_complete'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_start'
  | 'purchase'

interface SessionRow {
  sessionId: string
  chakra: string
  source: string
  variant: string
  stages: Record<Stage, Date | null>
}

const STAGE_PAIRS: Array<{ from: Stage; to: Stage; label: string }> = [
  { from: 'quiz_start', to: 'quiz_complete', label: 'quiz_start → quiz_complete' },
  { from: 'quiz_complete', to: 'product_view', label: 'quiz_complete → product_view' },
  { from: 'product_view', to: 'add_to_cart', label: 'product_view → add_to_cart' },
  { from: 'add_to_cart', to: 'checkout_start', label: 'add_to_cart → checkout_start' },
  { from: 'checkout_start', to: 'purchase', label: 'checkout_start → purchase' },
]

// ── 1. Drop-off Reason Detector ────────────────────────

interface DropOffAnalysis {
  stage: string
  dropRate: number
  sessions: number
  dropSessions: number
  topSegment: {
    chakra: string | null
    source: string | null
    variant: string | null
  }
}

/**
 * For each stage transition, finds sessions that reached stage N
 * but NOT stage N+1, then identifies the highest-concentration segment.
 */
export function analyzeDropOffs(rows: SessionRow[]): DropOffAnalysis[] {
  const results: DropOffAnalysis[] = []

  // Build validated progression sets (same logic as computeFunnel)
  const reachedStage = new Map<Stage, SessionRow[]>()
  for (const stage of ['quiz_start', 'quiz_complete', 'product_view', 'add_to_cart', 'checkout_start', 'purchase'] as Stage[]) {
    reachedStage.set(stage, [])
  }

  for (const row of rows) {
    const s = row.stages
    if (!s.quiz_start) continue
    reachedStage.get('quiz_start')!.push(row)

    if (!s.quiz_complete || s.quiz_complete < s.quiz_start) continue
    reachedStage.get('quiz_complete')!.push(row)

    if (!s.product_view || s.product_view < s.quiz_complete) continue
    reachedStage.get('product_view')!.push(row)

    if (!s.add_to_cart || s.add_to_cart < s.product_view) continue
    reachedStage.get('add_to_cart')!.push(row)

    if (!s.checkout_start || s.checkout_start < s.add_to_cart) continue
    reachedStage.get('checkout_start')!.push(row)

    if (!s.purchase || s.purchase < s.checkout_start) continue
    reachedStage.get('purchase')!.push(row)
  }

  for (const pair of STAGE_PAIRS) {
    const fromSet = reachedStage.get(pair.from) ?? []
    const toSet = new Set((reachedStage.get(pair.to) ?? []).map((r) => r.sessionId))

    if (fromSet.length === 0) continue

    const dropSessions = fromSet.filter((r) => !toSet.has(r.sessionId))
    const dropRate = +((dropSessions.length / fromSet.length) * 100).toFixed(1)

    // Find highest concentration segment
    const topSegment = findTopSegment(dropSessions)

    results.push({
      stage: pair.label,
      dropRate,
      sessions: fromSet.length,
      dropSessions: dropSessions.length,
      topSegment,
    })
  }

  return results
}

function findTopSegment(dropped: SessionRow[]): { chakra: string | null; source: string | null; variant: string | null } {
  if (dropped.length === 0) return { chakra: null, source: null, variant: null }

  const count = (arr: string[]) => {
    const map = new Map<string, number>()
    for (const v of arr) map.set(v, (map.get(v) ?? 0) + 1)
    let max = '', maxCount = 0
    for (const [k, c] of map) {
      if (c > maxCount) { max = k; maxCount = c }
    }
    // Only report if > 40% concentration (otherwise it's too spread out)
    return maxCount / arr.length > 0.4 ? max : null
  }

  return {
    chakra: count(dropped.map((r) => r.chakra)),
    source: count(dropped.map((r) => r.source)),
    variant: count(dropped.map((r) => r.variant)),
  }
}

// ── 2. Failure Pattern Detection ───────────────────────

interface FailurePatterns {
  stage: string
  avgTimeBeforeDropMinutes: number
  avgProductViews: number
  bundleShownRate: number
  avgLeadScore: number
}

/**
 * For each drop-off transition, analyzes behavioral signals from the dropped sessions.
 * Requires additional event + lead data fetched separately.
 */
export async function detectFailurePatterns(
  rows: SessionRow[],
  since: Date,
): Promise<FailurePatterns[]> {
  // Build validated progression sets
  const reachedStage = buildReachedSets(rows)
  const results: FailurePatterns[] = []

  // Get all events in window for additional context (product_view count, bundle_view)
  const allEvents = await prisma.funnelEvent.findMany({
    where: {
      createdAt: { gte: since },
      sessionId: { not: null },
      type: { in: ['product_view', 'bundle_view'] },
    },
    select: { sessionId: true, type: true },
  })

  // Count product_views and bundle_views per session
  const productViewCounts = new Map<string, number>()
  const bundleViewSessions = new Set<string>()
  for (const e of allEvents) {
    if (!e.sessionId) continue
    if (e.type === 'product_view') {
      productViewCounts.set(e.sessionId, (productViewCounts.get(e.sessionId) ?? 0) + 1)
    }
    if (e.type === 'bundle_view') {
      bundleViewSessions.add(e.sessionId)
    }
  }

  // Get lead scores by email for sessions with known users
  const sessionUserIds = new Set<string>()
  const sessionEvents = await prisma.funnelEvent.findMany({
    where: {
      createdAt: { gte: since },
      sessionId: { not: null },
      userId: { not: null },
    },
    select: { sessionId: true, userId: true },
    distinct: ['sessionId'],
  })
  const sessionToUser = new Map<string, string>()
  for (const e of sessionEvents) {
    if (e.sessionId && e.userId) {
      sessionToUser.set(e.sessionId, e.userId)
      sessionUserIds.add(e.userId)
    }
  }

  // Fetch lead scores via user emails
  const leadScoreMap = new Map<string, number>()
  if (sessionUserIds.size > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: [...sessionUserIds] } },
      select: { id: true, email: true },
    })
    const emails = users.map((u) => u.email).filter(Boolean) as string[]
    if (emails.length > 0) {
      const leads = await prisma.quizLead.findMany({
        where: { email: { in: emails } },
        select: { email: true, score: true },
      })
      const emailToScore = new Map(leads.map((l) => [l.email, l.score]))
      for (const u of users) {
        const score = emailToScore.get(u.email)
        if (score !== undefined) leadScoreMap.set(u.id, score)
      }
    }
  }

  for (const pair of STAGE_PAIRS) {
    const fromSet = reachedStage.get(pair.from) ?? []
    const toIds = new Set((reachedStage.get(pair.to) ?? []).map((r) => r.sessionId))

    const dropped = fromSet.filter((r) => !toIds.has(r.sessionId))
    if (dropped.length === 0) continue

    // Avg time on previous step (time between stages[from] and now — approximated as time spent at that stage)
    let totalTimeMinutes = 0
    let timeCount = 0
    const fromIdx = STAGE_PAIRS.findIndex((p) => p.from === pair.from)
    const prevStage = fromIdx > 0 ? STAGE_PAIRS[fromIdx - 1].from : null

    for (const r of dropped) {
      const stageTime = r.stages[pair.from]
      const prevTime = prevStage ? r.stages[prevStage] : null
      if (stageTime && prevTime) {
        totalTimeMinutes += (stageTime.getTime() - prevTime.getTime()) / 60_000
        timeCount++
      }
    }

    // Avg product views for dropped sessions
    let totalViews = 0
    for (const r of dropped) {
      totalViews += productViewCounts.get(r.sessionId) ?? 0
    }

    // Bundle shown rate
    let bundleShown = 0
    for (const r of dropped) {
      if (bundleViewSessions.has(r.sessionId)) bundleShown++
    }

    // Avg lead score
    let totalScore = 0
    let scoreCount = 0
    for (const r of dropped) {
      const userId = sessionToUser.get(r.sessionId)
      if (userId && leadScoreMap.has(userId)) {
        totalScore += leadScoreMap.get(userId)!
        scoreCount++
      }
    }

    results.push({
      stage: pair.label,
      avgTimeBeforeDropMinutes: timeCount > 0 ? +((totalTimeMinutes / timeCount).toFixed(1)) : 0,
      avgProductViews: +((totalViews / dropped.length).toFixed(1)),
      bundleShownRate: +((bundleShown / dropped.length * 100).toFixed(1)),
      avgLeadScore: scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0,
    })
  }

  return results
}

// ── 3. Auto-Suggest Action Engine ──────────────────────

interface Suggestion {
  priority: 'high' | 'medium' | 'low'
  stage: string
  message: string
  trigger: string
}

export function generateSuggestions(
  dropOffs: DropOffAnalysis[],
  patterns: FailurePatterns[],
  variantData: Record<string, { purchase: number; quiz_start: number }>,
): Suggestion[] {
  const suggestions: Suggestion[] = []

  for (const drop of dropOffs) {
    const pattern = patterns.find((p) => p.stage === drop.stage)

    // High drop at product_view → add_to_cart
    if (drop.stage.includes('product_view → add_to_cart') && drop.dropRate > 50) {
      suggestions.push({
        priority: 'high',
        stage: drop.stage,
        message: 'High drop at product page — run product page experiment',
        trigger: `dropRate=${drop.dropRate}%`,
      })

      if (pattern && pattern.avgProductViews < 2) {
        suggestions.push({
          priority: 'medium',
          stage: drop.stage,
          message: 'Users not exploring enough products — strengthen product recommendations',
          trigger: `avgProductViews=${pattern.avgProductViews}`,
        })
      }
    }

    // High drop at checkout
    if (drop.stage.includes('checkout_start → purchase') && drop.dropRate > 40) {
      suggestions.push({
        priority: 'high',
        stage: drop.stage,
        message: 'High checkout abandonment — optimize checkout friction',
        trigger: `dropRate=${drop.dropRate}%`,
      })
    }

    if (drop.stage.includes('add_to_cart → checkout_start') && drop.dropRate > 60) {
      suggestions.push({
        priority: 'high',
        stage: drop.stage,
        message: 'Cart-to-checkout drop severe — consider cart reminders or urgency',
        trigger: `dropRate=${drop.dropRate}%`,
      })
    }

    // Bundle visibility low
    if (pattern && pattern.bundleShownRate < 30 && drop.dropRate > 40) {
      suggestions.push({
        priority: 'medium',
        stage: drop.stage,
        message: 'Bundle visibility low at this stage — increase trigger rate or discount',
        trigger: `bundleShownRate=${pattern.bundleShownRate}%`,
      })
    }

    // High intent users dropping
    if (pattern && pattern.avgLeadScore > 60 && drop.dropRate > 30) {
      suggestions.push({
        priority: 'high',
        stage: drop.stage,
        message: 'High-intent users dropping — likely UX/checkout issue, not interest issue',
        trigger: `avgLeadScore=${pattern.avgLeadScore}, dropRate=${drop.dropRate}%`,
      })
    }

    // Segment concentration
    if (drop.topSegment.chakra) {
      suggestions.push({
        priority: 'low',
        stage: drop.stage,
        message: `Drop concentrated in "${drop.topSegment.chakra}" chakra — review chakra-specific content`,
        trigger: `topChakra=${drop.topSegment.chakra}`,
      })
    }
  }

  // Variant comparison
  const variantKeys = Object.keys(variantData)
  if (variantKeys.length >= 2) {
    const sorted = variantKeys
      .map((k) => {
        const v = variantData[k]
        return { key: k, convRate: v.quiz_start > 0 ? v.purchase / v.quiz_start : 0 }
      })
      .sort((a, b) => b.convRate - a.convRate)

    const best = sorted[0]
    const worst = sorted[sorted.length - 1]
    if (best.convRate > 0 && worst.convRate > 0 && best.convRate > worst.convRate * 1.3) {
      suggestions.push({
        priority: 'high',
        stage: 'experiment',
        message: `Variant "${worst.key}" underperforming "${best.key}" by ${(((best.convRate - worst.convRate) / worst.convRate) * 100).toFixed(0)}% — consider disabling`,
        trigger: `best=${(best.convRate * 100).toFixed(1)}% vs worst=${(worst.convRate * 100).toFixed(1)}%`,
      })
    }
  }

  // Sort by priority
  const order: Record<string, number> = { high: 0, medium: 1, low: 2 }
  return suggestions.sort((a, b) => order[a.priority] - order[b.priority])
}

// ── 4. Auto-Experiment Trigger ─────────────────────────

interface ExperimentAction {
  triggered: boolean
  key: string
  reason: string
  isNew?: boolean
}

/**
 * If a critical drop-off has no active experiment, auto-creates one.
 * Safety gates: max active experiments, cooldown per stage, min drop sessions.
 */
export async function maybeAutoExperiment(
  dropOffs: DropOffAnalysis[],
): Promise<ExperimentAction[]> {
  const actions: ExperimentAction[] = []
  const { gates, dropOff, loop } = optimizationConfig
  let actionsThisRun = 0

  // Gate: check how many experiments are already active
  const activeCount = await countActiveExperiments()
  if (activeCount >= gates.maxActiveExperiments) {
    await logOptimization({
      action: 'skip_experiment',
      reason: `Active experiments (${activeCount}) >= max (${gates.maxActiveExperiments})`,
    })
    return actions
  }

  // Mapping: which stage-drop deserves an experiment (key → scope)
  const experimentMap: Record<string, { key: string; scope: string }> = {
    'product_view → add_to_cart': { key: 'auto_product_page', scope: 'product_page' },
    'add_to_cart → checkout_start': { key: 'auto_cart_to_checkout', scope: 'cart' },
    'checkout_start → purchase': { key: 'auto_checkout_flow', scope: 'checkout' },
    'quiz_start → quiz_complete': { key: 'auto_quiz_completion', scope: 'quiz' },
  }

  for (const drop of dropOffs) {
    const expEntry = experimentMap[drop.stage]
    if (!expEntry) continue
    const { key: expKey, scope: expScope } = expEntry
    if (drop.dropRate < dropOff.experimentThreshold) continue

    // Gate: minimum dropped sessions
    if (drop.dropSessions < gates.minDropSessions) {
      actions.push({
        triggered: false,
        key: expKey,
        reason: `Insufficient drop sessions (${drop.dropSessions} < ${gates.minDropSessions})`,
      })
      continue
    }

    // Gate: cooldown check
    const cooled = await isInCooldown(expKey)
    if (cooled) {
      actions.push({
        triggered: false,
        key: expKey,
        reason: `In cooldown (${gates.cooldownHours}h) for ${expKey}`,
      })
      continue
    }

    // Gate: re-check active count (may have created one in this loop)
    const currentActive = await countActiveExperiments()
    if (currentActive >= gates.maxActiveExperiments) {
      actions.push({
        triggered: false,
        key: expKey,
        reason: `Active experiments limit reached during loop`,
      })
      break
    }

    // Gate: per-run action limit (prevent cascade)
    if (actionsThisRun >= loop.maxActionsPerRun) {
      actions.push({
        triggered: false,
        key: expKey,
        reason: `Per-run action limit reached (${loop.maxActionsPerRun})`,
      })
      break
    }

    try {
      const result = await createExperiment({ key: expKey, scope: expScope })
      actions.push({
        triggered: result.isNew,
        key: expKey,
        reason: `${drop.stage} dropRate=${drop.dropRate}%`,
        isNew: result.isNew,
      })

      if (result.isNew) actionsThisRun++

      await logOptimization({
        action: 'create_experiment',
        stage: expKey,
        reason: `${drop.stage} dropRate=${drop.dropRate}%, dropSessions=${drop.dropSessions}`,
        metrics: { dropRate: drop.dropRate, dropSessions: drop.dropSessions, isNew: result.isNew },
      })
    } catch {
      actions.push({
        triggered: false,
        key: expKey,
        reason: `Failed to create experiment for ${drop.stage}`,
      })
    }
  }

  return actions
}

// ── 5. Priority Scoring ────────────────────────────────

interface PriorityItem {
  stage: string
  dropSessions: number
  impactScore: number
}

/**
 * Computes revenue impact per drop-off point.
 * impact = dropSessions × averageOrderValue
 */
export async function computePriorities(
  dropOffs: DropOffAnalysis[],
  since: Date,
): Promise<PriorityItem[]> {
  // Get AOV from recent completed orders (exclude pending and refunded)
  const aov = await prisma.order.aggregate({
    where: {
      status: { notIn: ['pending_payment', 'refunded'] },
      createdAt: { gte: since },
    },
    _avg: { totalPaise: true },
    _count: { id: true },
  })

  const avgOrderValue = aov._avg.totalPaise ?? 0

  return dropOffs
    .map((d) => ({
      stage: d.stage,
      dropSessions: d.dropSessions,
      impactScore: Math.round(d.dropSessions * (avgOrderValue / 100)), // in rupees
    }))
    .sort((a, b) => b.impactScore - a.impactScore)
}

// ── Helpers ────────────────────────────────────────────

function buildReachedSets(rows: SessionRow[]): Map<Stage, SessionRow[]> {
  const map = new Map<Stage, SessionRow[]>()
  for (const stage of ['quiz_start', 'quiz_complete', 'product_view', 'add_to_cart', 'checkout_start', 'purchase'] as Stage[]) {
    map.set(stage, [])
  }

  for (const row of rows) {
    const s = row.stages
    if (!s.quiz_start) continue
    map.get('quiz_start')!.push(row)

    if (!s.quiz_complete || s.quiz_complete < s.quiz_start) continue
    map.get('quiz_complete')!.push(row)

    if (!s.product_view || s.product_view < s.quiz_complete) continue
    map.get('product_view')!.push(row)

    if (!s.add_to_cart || s.add_to_cart < s.product_view) continue
    map.get('add_to_cart')!.push(row)

    if (!s.checkout_start || s.checkout_start < s.add_to_cart) continue
    map.get('checkout_start')!.push(row)

    if (!s.purchase || s.purchase < s.checkout_start) continue
    map.get('purchase')!.push(row)
  }

  return map
}
