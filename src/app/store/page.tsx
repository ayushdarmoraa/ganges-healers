import Link from 'next/link'
import { canonicalOf } from '@/config/site'
import type { Metadata } from 'next'
import { listProducts } from '@/lib/store/queries'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeStoreIndexCrumbs } from '@/lib/seo/breadcrumbs'
import EmptyState from '@/components/empty/EmptyState'
import { Button } from '@/components/ui/button'
import { clearSearchParams } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Store | Ganges Healers',
    description: 'Browse our curated products — oils, crystals, and more.',
    alternates: { canonical: canonicalOf('/store') },
  }
}

export default async function StorePage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const sp = (await searchParams) || {}
  const q = sp.q
  const categorySlug = sp.categorySlug

  const { items, nextCursor } = await listProducts({ q, categorySlug, limit: 20 })

  return (
    <div className="container mx-auto p-6">
      {(() => { const crumbs = makeStoreIndexCrumbs(); return (<>
        <Breadcrumbs crumbs={crumbs} />
        <BreadcrumbsLd crumbs={crumbs} />
      </>) })()}
      <h1 className="text-3xl font-semibold">Store</h1>
      <form className="mt-4 flex gap-2" action="/store" method="get">
        <input name="q" defaultValue={q} placeholder="Search products" className="border px-3 py-2 rounded w-full" />
        {categorySlug ? <input type="hidden" name="categorySlug" value={categorySlug} /> : null}
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded" type="submit">Search</button>
      </form>
      {items.length === 0 ? (
        <EmptyState
          title="No products found"
          subtitle="Try a different search or category."
          action={(() => {
            const hasFilters = Boolean(q || categorySlug)
            if (!hasFilters) return null
            const qs = new URLSearchParams(Object.entries({ q: q || '', categorySlug: categorySlug || '' }).filter(([,v]) => v))
            const href = clearSearchParams('/store' + (qs.toString() ? `?${qs.toString()}` : ''), ['q','categorySlug'])
            return <Link href={href}><Button variant="secondary">Clear filters</Button></Link>
          })()}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {items.map((p) => (
            <Link href={`/store/${p.slug}`} key={p.id} className="border rounded p-4 hover:shadow">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.title} className="w-full h-40 object-cover rounded" />
              ) : null}
              <div className="mt-2 font-medium">{p.title}</div>
              <div className="text-sm text-muted-foreground line-clamp-2">{p.shortDescription}</div>
              <div className="mt-2 text-sm">₹{(p.pricePaise / 100).toFixed(2)}</div>
              <div className="mt-1 text-xs text-muted-foreground">{p.ratingAvg ? `★ ${p.ratingAvg.toFixed(1)}` : 'No ratings'}</div>
              <div className="mt-1 text-xs">
                {p.stockStatus === 'OUT' ? (
                  <span className="text-red-600">Out of stock</span>
                ) : p.stockStatus === 'LOW' ? (
                  <span className="text-amber-600">Low stock</span>
                ) : (
                  <span className="text-green-600">In stock</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      {nextCursor ? (
        <form className="mt-6" action="/store" method="get">
          {q ? <input type="hidden" name="q" value={q} /> : null}
          {categorySlug ? <input type="hidden" name="categorySlug" value={categorySlug} /> : null}
          <input type="hidden" name="cursor" value={nextCursor} />
          <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded">Load more</button>
        </form>
      ) : null}
    </div>
  )
}
