import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { optimizationConfig } from '@/lib/analytics/optimization-config'

// ── Types ──────────────────────────────────────────────

interface VariantStats {
  name: string
  impressions: number
  purchases: number
  conversionRate: number
}

interface ExperimentEvaluation {
  experimentId: string
  key: string
  variants: VariantStats[]
  winner: string | null
  reason: string
  action: 'completed' | 'continue' | 'expired'
}

// ── Audit Logging ──────────────────────────────────────

export async function logOptimization(params: {
  action: string
  stage?: string | null
  reason: string
  metrics?: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.optimizationLog.create({
      data: {
        action: params.action,
        stage: params.stage ?? null,
        reason: params.reason,
        metrics: (params.metrics as Prisma.InputJsonValue) ?? undefined,
      },
    })
  } catch (err) {
    console.error('[optimization-log] Failed to write:', err)
  }
}

// ── Safety Checks ──────────────────────────────────────

/** Returns the count of currently active experiments. */
export async function countActiveExperiments(): Promise<number> {
  return prisma.experiment.count({
    where: { isActive: true, status: 'active' },
  })
}

/** Checks if an experiment was created for the given stage key within the cooldown window. */
export async function isInCooldown(stageKey: string): Promise<boolean> {
  const { cooldownHours } = optimizationConfig.gates
  const since = new Date(Date.now() - cooldownHours * 60 * 60 * 1000)

  const recent = await prisma.optimizationLog.findFirst({
    where: {
      action: 'create_experiment',
      stage: stageKey,
      createdAt: { gte: since },
    },
    select: { id: true },
  })

  return !!recent
}

// ── Winner Detection ───────────────────────────────────

/**
 * Evaluates a single experiment for winner detection.
 *
 * Logic:
 *  1. Count impressions per variant (FunnelEvent with experimentVariant matching)
 *  2. Count purchases per variant
 *  3. If both variants have >= minImpressions AND one leads by >= minLift → winner
 *  4. If experiment is older than maxDurationDays → expire with best performer
 */
export async function evaluateExperiment(
  experiment: { id: string; key: string; createdAt: Date },
): Promise<ExperimentEvaluation> {
  const { minImpressions, minLift, minDaysActive, maxDurationDays } = optimizationConfig.experiments

  // Guard: don't evaluate experiments younger than minDaysActive
  const ageDays = (Date.now() - experiment.createdAt.getTime()) / (24 * 60 * 60 * 1000)
  if (ageDays < minDaysActive) {
    return {
      experimentId: experiment.id,
      key: experiment.key,
      variants: [],
      winner: null,
      reason: `Too young (${ageDays.toFixed(1)} days < ${minDaysActive} min). Waiting for stable data.`,
      action: 'continue',
    }
  }

  const variants = await prisma.experimentVariant.findMany({
    where: { experimentId: experiment.id },
    select: { name: true },
  })

  const variantStats: VariantStats[] = []

  for (const v of variants) {
    const variantTag = `${experiment.key}:${v.name}`

    const [impressions, purchases] = await Promise.all([
      prisma.funnelEvent.count({
        where: { experimentVariant: variantTag },
      }),
      prisma.funnelEvent.count({
        where: { experimentVariant: variantTag, type: 'purchase' },
      }),
    ])

    variantStats.push({
      name: v.name,
      impressions,
      purchases,
      conversionRate: impressions > 0 ? purchases / impressions : 0,
    })
  }

  // Check if expired
  const isExpired = ageDays > maxDurationDays

  // Sort by conversion rate descending
  const sorted = [...variantStats].sort((a, b) => b.conversionRate - a.conversionRate)
  const best = sorted[0]
  const second = sorted[1]

  // Do both variants have enough data?
  const hasEnoughData = variantStats.every((v) => v.impressions >= minImpressions)

  if (hasEnoughData && best && second && second.conversionRate > 0) {
    const lift = (best.conversionRate - second.conversionRate) / second.conversionRate

    if (lift >= minLift) {
      return {
        experimentId: experiment.id,
        key: experiment.key,
        variants: variantStats,
        winner: best.name,
        reason: `Variant ${best.name} wins by ${(lift * 100).toFixed(1)}% lift (${(best.conversionRate * 100).toFixed(1)}% vs ${(second.conversionRate * 100).toFixed(1)}%)`,
        action: 'completed',
      }
    }
  }

  if (isExpired) {
    return {
      experimentId: experiment.id,
      key: experiment.key,
      variants: variantStats,
      winner: best?.name ?? null,
      reason: `Experiment expired after ${Math.round(ageDays)} days. Best performer: ${best?.name ?? 'none'} (${(best?.conversionRate ?? 0 * 100).toFixed(1)}%)`,
      action: 'expired',
    }
  }

  return {
    experimentId: experiment.id,
    key: experiment.key,
    variants: variantStats,
    winner: null,
    reason: `Needs more data. ${variantStats.map((v) => `${v.name}: ${v.impressions} impressions`).join(', ')}`,
    action: 'continue',
  }
}

// ── Experiment Completion ──────────────────────────────

/**
 * Completes an experiment: marks winner, deactivates, logs decision.
 */
export async function completeExperiment(
  experimentId: string,
  winner: string | null,
  reason: string,
): Promise<void> {
  await prisma.experiment.update({
    where: { id: experimentId },
    data: {
      isActive: false,
      status: 'completed',
      winner,
      completedAt: new Date(),
    },
  })

  const exp = await prisma.experiment.findUnique({
    where: { id: experimentId },
    select: { key: true },
  })

  await logOptimization({
    action: 'complete_experiment',
    stage: exp?.key ?? experimentId,
    reason,
    metrics: { winner, experimentId },
  })
}

// ── Evaluate All Active Experiments ────────────────────

/**
 * Evaluates all active experiments and auto-completes winners / expired ones.
 * Returns summary of all evaluations.
 */
export async function evaluateAllExperiments(): Promise<ExperimentEvaluation[]> {
  const active = await prisma.experiment.findMany({
    where: { isActive: true, status: 'active' },
    select: { id: true, key: true, createdAt: true },
  })

  const results: ExperimentEvaluation[] = []

  for (const exp of active) {
    const evaluation = await evaluateExperiment(exp)
    results.push(evaluation)

    if (evaluation.action === 'completed' || evaluation.action === 'expired') {
      await completeExperiment(exp.id, evaluation.winner, evaluation.reason)
    }
  }

  return results
}
