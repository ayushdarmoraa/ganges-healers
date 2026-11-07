/**
 * Canonical Event Taxonomy — single source of truth.
 *
 * DO NOT add new event types without clear justification.
 * Every addition must be wired into:
 *  1. trackEvent() (server-side)
 *  2. /api/events/track (client-side whitelist)
 *  3. lead-scoring.ts (if it affects lead score)
 *  4. Any relevant analytics APIs
 */
export const EVENT_TYPES = [
  'quiz_start',
  'quiz_complete',
  'product_view',
  'add_to_cart',
  'checkout_start',
  'purchase',
  'abandoned_cart',
  'bundle_view',
  'bundle_click',
  'bundle_purchase',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

/**
 * Events that may only be created server-side (after verified actions).
 * The client ingestion endpoint MUST reject these.
 */
export const SERVER_ONLY_EVENTS: ReadonlySet<EventType> = new Set([
  'purchase',
  'checkout_start',
])

/**
 * Events allowed from the client ingestion endpoint.
 */
export const CLIENT_ALLOWED_EVENTS: ReadonlySet<EventType> = new Set(
  EVENT_TYPES.filter((t) => !SERVER_ONLY_EVENTS.has(t)),
)
