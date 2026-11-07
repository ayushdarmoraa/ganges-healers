'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { trackClientEvent } from '@/lib/analytics/track-client-event'

interface BundleProduct {
  slug: string
  title: string
  pricePaise: number
}

interface DynamicBundleProps {
  bundle: {
    slug: string
    title: string
    description: string | null
    pricePaise: number
    chakra: string | null
    items: Array<{ product: BundleProduct }>
  }
  discountPct: number
  reason: string | null
}

export default function DynamicBundleBanner({ bundle, discountPct, reason }: DynamicBundleProps) {
  const tracked = useRef(false)

  useEffect(() => {
    if (!tracked.current) {
      tracked.current = true
      trackClientEvent('bundle_view', {
        metadata: { bundleSlug: bundle.slug, discountPct, reason },
        chakra: bundle.chakra ?? undefined,
      })
    }
  }, [bundle.slug, bundle.chakra, discountPct, reason])
  const originalTotal = bundle.items.reduce((s, i) => s + i.product.pricePaise, 0)
  const discountedPrice = Math.round(bundle.pricePaise * (1 - discountPct / 100))
  const totalSavings = originalTotal - discountedPrice
  const savingsPercent = originalTotal > 0 ? Math.round((totalSavings / originalTotal) * 100) : 0

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <h3 className="text-lg font-bold">
          {reason === 'high_engagement_score'
            ? 'Curated Just for You'
            : 'Complete Your Practice'}
        </h3>
        {savingsPercent > 0 && (
          <span className="ml-auto bg-amber-600 text-white text-xs font-bold px-2.5 py-1 rounded-full">
            Save {savingsPercent}%
          </span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {bundle.description || `Get everything you need in one ${bundle.chakra ? `${bundle.chakra} Chakra` : 'sacred'} bundle.`}
      </p>

      {discountPct > 0 && (
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
          🔥 Extra {discountPct}% off — limited time offer
        </p>
      )}

      <ul className="text-sm space-y-1">
        {bundle.items.map((item) => (
          <li key={item.product.slug} className="flex items-center gap-2">
            <span className="text-amber-600">✓</span>
            <span>{item.product.title}</span>
            <span className="text-muted-foreground line-through text-xs ml-auto">
              ₹{(item.product.pricePaise / 100).toFixed(0)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between pt-3 border-t border-amber-200 dark:border-amber-800">
        <div>
          <span className="text-sm text-muted-foreground line-through mr-2">
            ₹{(originalTotal / 100).toFixed(0)}
          </span>
          <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">
            ₹{(discountedPrice / 100).toFixed(0)}
          </span>
        </div>
        <Link
          href={`/store/bundles/${bundle.slug}`}
          onClick={() =>
            trackClientEvent('bundle_click', {
              metadata: { bundleSlug: bundle.slug, discountPct, reason },
              chakra: bundle.chakra ?? undefined,
            })
          }
          className="inline-flex items-center justify-center rounded-md bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-700 transition-colors"
        >
          Get Bundle Deal
        </Link>
      </div>
    </div>
  )
}
