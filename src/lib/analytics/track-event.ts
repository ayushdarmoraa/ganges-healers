import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { incrementLeadScore } from '@/lib/analytics/lead-scoring'
import type { EventType } from '@/lib/analytics/event-types'

/**
 * Re-export EventType as TrackableEventType for backward compatibility.
 * The canonical list lives in event-types.ts — do not duplicate here.
 */
export type TrackableEventType = EventType

export interface TrackEventParams {
  type: TrackableEventType
  userId?: string | null
  /** If provided, lead score is updated for this email. */
  email?: string | null
  sessionId?: string | null
  experimentVariant?: string | null
  source?: string | null
  chakra?: string | null
  metadata?: Record<string, unknown>
  /** Skip dedup check (default: false). */
  allowDuplicate?: boolean
}

/**
 * Deduplication window in milliseconds.
 * Events with the same (sessionId, type) within this window are considered duplicates.
 */
const DEDUP_WINDOW_MS = 5_000

/**
 * Central event tracker.
 *
 * Every server-side event should flow through this function.
 * It:
 *  1. Checks for duplicate events within the dedup window.
 *  2. Persists the event to the FunnelEvent table.
 *  3. Atomically increments the lead score when an email is known.
 *
 * Lead scoring runs in parallel with event persist (non-blocking).
 * Retries once on write failure to prevent silent data gaps.
 * Fire-and-forget — callers should `.catch(() => {})` when non-critical.
 */
export async function trackEvent(params: TrackEventParams): Promise<void> {
  try {
    // 1. Deduplication guard
    if (!params.allowDuplicate && params.sessionId) {
      const windowStart = new Date(Date.now() - DEDUP_WINDOW_MS)
      const dup = await prisma.funnelEvent.findFirst({
        where: {
          sessionId: params.sessionId,
          type: params.type,
          createdAt: { gte: windowStart },
        },
        select: { id: true },
      })
      if (dup) {
        return // duplicate — skip silently
      }
    }

    // 2. Persist event + 3. Update lead score (parallel, non-blocking)
    const eventData = {
      type: params.type,
      userId: params.userId ?? null,
      sessionId: params.sessionId ?? null,
      experimentVariant: params.experimentVariant ?? null,
      source: params.source ?? null,
      chakra: params.chakra ?? null,
      metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
    }

    const writeEvent = async () => {
      try {
        await prisma.funnelEvent.create({ data: eventData })
      } catch {
        // Retry once on failure
        await prisma.funnelEvent.create({ data: eventData })
      }
    }

    const writes: Promise<unknown>[] = [writeEvent()]

    if (params.email) {
      writes.push(incrementLeadScore(params.email, params.type))
    }

    await Promise.all(writes)
  } catch (err) {
    // Both attempts failed — log for observability
    console.error('[trackEvent] Failed after retry:', params.type, err)
  }
}
