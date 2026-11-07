// Meta Pixel (Facebook Pixel) helper
// All calls are no-ops when the pixel ID is missing or on the server

type FbqStandard =
  | 'PageView'
  | 'ViewContent'
  | 'Lead'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'Purchase'

type FbqCustom =
  | 'QuizStart'
  | 'QuizComplete'

interface FbqFn {
  (action: 'track', event: FbqStandard, params?: Record<string, unknown>): void
  (action: 'trackCustom', event: FbqCustom, params?: Record<string, unknown>): void
  (action: 'init', pixelId: string): void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (...args: any[]): void
  // queue used before the real script loads
  queue?: unknown[][]
  loaded?: boolean
  version?: string
}

declare global {
  interface Window {
    fbq?: FbqFn
    _fbq?: FbqFn
  }
}

function getFbq(): FbqFn | undefined {
  if (typeof window === 'undefined') return undefined
  return window.fbq
}

// ─── Standard events ───────────────────────────────────

export function trackPageView() {
  getFbq()?.('track', 'PageView')
}

export function trackViewContent(params: {
  content_name: string
  content_ids: string[]
  content_type?: string
  value?: number
  currency?: string
}) {
  getFbq()?.('track', 'ViewContent', params)
}

export function trackLead(params?: Record<string, unknown>) {
  getFbq()?.('track', 'Lead', params)
}

export function trackAddToCart(params: {
  content_name: string
  content_ids: string[]
  value: number
  currency: string
}) {
  getFbq()?.('track', 'AddToCart', params)
}

export function trackInitiateCheckout(params: {
  content_ids: string[]
  num_items: number
  value: number
  currency: string
}) {
  getFbq()?.('track', 'InitiateCheckout', params)
}

export function trackPurchase(params: {
  content_ids: string[]
  content_type?: string
  num_items: number
  value: number
  currency: string
}) {
  getFbq()?.('track', 'Purchase', params)
}

// ─── Custom events ─────────────────────────────────────

export function trackQuizStart() {
  getFbq()?.('trackCustom', 'QuizStart')
}

export function trackQuizComplete(params?: Record<string, unknown>) {
  getFbq()?.('trackCustom', 'QuizComplete', params)
}
