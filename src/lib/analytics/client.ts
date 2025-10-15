// src/lib/analytics/client.ts
// Tiny client-side analytics shim; tree-shakeable and safe for SSR
// No side-effects at module scope

export type AnalyticsEvent = 'booking_modal_open' | 'program_enroll_click' | 'product_service_cta_click'

export type BookingModalOpenProps = {
  serviceSlug: string
  programSlug?: string
  source: 'query-openBooking' | 'user-action'
  path: string
  ts: number
}

export type ProgramEnrollClickProps = {
  programSlug: string
  serviceSlug?: string
  path: string
  ts: number
}

export type ProductServiceCtaClickProps = {
  productSlug: string
  serviceSlug: string
  path: string
  ts: number
}

export function track(
  event: AnalyticsEvent,
  props: BookingModalOpenProps | ProgramEnrollClickProps | ProductServiceCtaClickProps
): void {
  if (typeof window === 'undefined') return
  // Stable log tag for local inspection
  console.log(`[analytics][${event}]`, props)
  // Push into dataLayer if present
  const w = window as unknown as { dataLayer?: Array<Record<string, unknown>> }
  if (Array.isArray(w.dataLayer)) {
    w.dataLayer.push({ event, ...props })
  }
}
