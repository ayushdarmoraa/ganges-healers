'use client'

import Link from 'next/link'
import { track } from '@/lib/analytics/client'

export default function ProductCtaAnalytics({
  productSlug,
  serviceSlug,
  href,
  children,
}: {
  productSlug: string
  serviceSlug: string
  href: string
  children: React.ReactNode
}) {
  const onClick = () => {
    // Fire and forget; do not block navigation
    try {
      track('product_service_cta_click', {
        productSlug,
        serviceSlug,
        path: typeof window !== 'undefined' ? window.location.pathname + window.location.search : '',
        ts: Date.now(),
      })
    } catch {
      // no-op
    }
  }

  return (
    <Link href={href} onClick={onClick} aria-label={typeof children === 'string' ? undefined : 'View related service'}>
      <span className="inline-flex items-center justify-center rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 focus-ring">
        {children}
      </span>
    </Link>
  )
}
