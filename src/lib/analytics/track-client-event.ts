/**
 * Client-side event helper.
 * Fires a POST to /api/events/track — fire-and-forget.
 * The server automatically resolves sessionId, userId, and experiment variants from cookies.
 */
export function trackClientEvent(
  type: string,
  extra?: {
    metadata?: Record<string, unknown>
    source?: string
    chakra?: string
    email?: string
  },
): void {
  if (typeof window === 'undefined') return

  fetch('/api/events/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      metadata: extra?.metadata,
      source: extra?.source,
      chakra: extra?.chakra,
      email: extra?.email,
    }),
    // keepalive ensures the request completes even if the page navigates away
    keepalive: true,
  }).catch(() => {})
}
