import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type FunnelEventType =
  | 'quiz_start'
  | 'quiz_complete'
  | 'product_view'
  | 'add_to_cart'
  | 'checkout_start'
  | 'purchase'
  | 'abandoned_cart'

/**
 * Log a funnel event to the database.
 * Fire-and-forget — callers should not await unless they need the result.
 */
export async function logFunnelEvent(params: {
  type: FunnelEventType
  userId?: string | null
  sessionId?: string | null
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    await prisma.funnelEvent.create({
      data: {
        type: params.type,
        userId: params.userId ?? null,
        sessionId: params.sessionId ?? null,
        metadata: (params.metadata as Prisma.InputJsonValue) ?? undefined,
      },
    })
  } catch (err) {
    console.error('[funnel-event] Failed to log:', params.type, err)
  }
}
