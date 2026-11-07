'use client'

import { useEffect } from 'react'
import { trackViewContent } from '@/lib/analytics/meta-pixel'
import { trackClientEvent } from '@/lib/analytics/track-client-event'
import { persistVariantClient, type Variant } from '@/lib/experiments/client'

interface Props {
  productId: string
  title: string
  pricePaise: number
  chakra?: string | null
  source?: string | null
  headlineVariant: Variant
}

export default function ProductViewTracker({ productId, title, pricePaise, chakra, source, headlineVariant }: Props) {
  useEffect(() => {
    persistVariantClient('product_headline', headlineVariant)
    trackViewContent({
      content_name: title,
      content_ids: [productId],
      content_type: 'product',
      value: pricePaise / 100,
      currency: 'INR',
    })

    trackClientEvent('product_view', {
      metadata: { productId, title, pricePaise },
      chakra: chakra ?? undefined,
      source: source ?? undefined,
    })
  }, [productId, title, pricePaise, chakra, source, headlineVariant])

  return null
}
