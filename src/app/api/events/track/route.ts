import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { trackEvent } from '@/lib/analytics/track-event'
import type { EventType } from '@/lib/analytics/event-types'
import { CLIENT_ALLOWED_EVENTS } from '@/lib/analytics/event-types'
import { getSessionId, getExperimentVariants } from '@/lib/analytics/session'
import { stampFirstTouch } from '@/lib/analytics/first-touch'

/**
 * POST /api/events/track
 * Client-side event ingestion endpoint.
 * Automatically attaches sessionId, userId, and experiment variants from cookies.
 *
 * Server-only events (purchase, checkout_start) are rejected here.
 */
export async function POST(req: Request) {
  try {
    const body: unknown = await req.json().catch(() => null)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 })
    const { type, metadata, source, chakra, email } = body as Record<string, unknown>

    if (!type || typeof type !== 'string' || !CLIENT_ALLOWED_EVENTS.has(type as EventType)) {
      return NextResponse.json({ error: 'Invalid event type' }, { status: 400 })
    }
    if (email != null && typeof email !== 'string' || metadata != null && (typeof metadata !== 'object' || Array.isArray(metadata))) return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 })

    // Resolve context from cookies / session
    const [rawSessionId, variants, session] = await Promise.all([
      getSessionId(),
      getExperimentVariants(),
      auth().catch(() => null),
    ])

    // NEVER allow null sessionId — regenerate if missing
    const sessionId = rawSessionId || crypto.randomUUID()

    // Pick the first experiment variant (most events are single-experiment scoped)
    const variantEntries = Object.entries(variants)
    const experimentVariant = variantEntries.length > 0
      ? `${variantEntries[0][0]}:${variantEntries[0][1]}`
      : null

    await trackEvent({
      type: type as EventType,
      userId: session?.user?.id ?? null,
      email: email ?? session?.user?.email ?? null,
      sessionId,
      experimentVariant,
      source: typeof source === 'string' ? source : null,
      chakra: typeof chakra === 'string' ? chakra : null,
      metadata: metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : undefined,
    })

    // Stamp first-touch attribution (no-op if already stamped)
    if (session?.user?.id) {
      stampFirstTouch(
        session.user.id,
        typeof source === 'string' ? source : null,
        experimentVariant,
      ).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[api/events/track] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
