'use client'

import Link from 'next/link'

export interface BundleDisplayItem {
  id: string
  slug: string
  title: string
  description: string | null
  pricePaise: number
  chakra: string | null
  items: Array<{
    product: { slug: string; title: string; pricePaise: number }
  }>
}

export default function BundleCard({ bundle }: { bundle: BundleDisplayItem }) {
  const originalTotal = bundle.items.reduce((s, i) => s + i.product.pricePaise, 0)
  const savings = originalTotal - bundle.pricePaise
  const savingsPercent = originalTotal > 0 ? Math.round((savings / originalTotal) * 100) : 0

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{bundle.title}</h3>
        {savingsPercent > 0 && (
          <span className="bg-green-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            Save {savingsPercent}%
          </span>
        )}
      </div>
      {bundle.description && (
        <p className="text-sm text-muted-foreground">{bundle.description}</p>
      )}
      {bundle.chakra && (
        <p className="text-xs text-purple-600 dark:text-purple-400">
          🔮 {bundle.chakra} Chakra Kit
        </p>
      )}
      <ul className="text-sm space-y-1">
        {bundle.items.map((item) => (
          <li key={item.product.slug} className="flex items-center gap-2">
            <span className="text-primary">•</span>
            <Link href={`/store/${item.product.slug}`} className="hover:underline">
              {item.product.title}
            </Link>
            <span className="text-muted-foreground line-through text-xs">
              ₹{(item.product.pricePaise / 100).toFixed(0)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between pt-2 border-t">
        <div>
          {savings > 0 && (
            <span className="text-sm text-muted-foreground line-through mr-2">
              ₹{(originalTotal / 100).toFixed(0)}
            </span>
          )}
          <span className="text-xl font-bold">₹{(bundle.pricePaise / 100).toFixed(0)}</span>
        </div>
        <Link
          href={`/store/bundles/${bundle.slug}`}
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          View Bundle
        </Link>
      </div>
    </div>
  )
}
