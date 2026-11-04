import Link from 'next/link'
import Image from 'next/image'
import { canonicalOf } from '@/config/site'
import type { Metadata } from 'next'
import { listProducts } from '@/lib/store/queries'
import { prisma } from '@/lib/prisma'
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
  const chakra = sp.chakra

  const CHAKRAS = [
    { value: 'Root', label: 'Root' },
    { value: 'Sacral', label: 'Sacral' },
    { value: 'Solar Plexus', label: 'Solar Plexus' },
    { value: 'Heart', label: 'Heart' },
    { value: 'Throat', label: 'Throat' },
    { value: 'Third Eye', label: 'Third Eye' },
    { value: 'Crown', label: 'Crown' },
  ] as const

  const { items, nextCursor } = await listProducts({ q, categorySlug, chakra, limit: 20 })

  const categories = await prisma.productCategory.findMany({
    select: { slug: true, title: true, _count: { select: { products: { where: { isActive: true } } } } },
    orderBy: { title: 'asc' },
  })

  const featuredTools = await prisma.product.findMany({
    where: { isConsecrated: true, isActive: true },
    select: { slug: true, title: true, pricePaise: true, imageUrl: true, chakra: true },
    take: 6,
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="container mx-auto p-6">
      {(() => { const crumbs = makeStoreIndexCrumbs(); return (<>
        <Breadcrumbs crumbs={crumbs} />
        <BreadcrumbsLd crumbs={crumbs} />
      </>) })()}
      {/* Sacred Store Hero */}
      <section className="text-center py-10 space-y-3">
        <h1 className="text-4xl font-bold tracking-tight">Sacred Healing Store</h1>
        <p className="text-lg text-muted-foreground">Sacred tools for meditation, healing, and conscious living.</p>
        <p className="text-sm text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Each product in this store is carefully selected and energetically prepared to support your spiritual practice and inner transformation.
        </p>
      </section>

      <form className="flex gap-2" action="/store" method="get">
        <input name="q" defaultValue={q} placeholder="Search products" className="border px-3 py-2 rounded w-full focus-ring" />
        {categorySlug ? <input type="hidden" name="categorySlug" value={categorySlug} /> : null}
        {chakra ? <input type="hidden" name="chakra" value={chakra} /> : null}
        <button className="px-4 py-2 bg-primary text-primary-foreground rounded focus-ring" type="submit">Search</button>
      </form>

      {/* Chakra filter bar */}
      <nav aria-label="Filter by Chakra" className="mt-4">
        <p className="text-sm font-medium text-muted-foreground mb-2">Filter by Chakra</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={(() => { const p = new URLSearchParams(); if (q) p.set('q', q); if (categorySlug) p.set('categorySlug', categorySlug); return '/store' + (p.toString() ? `?${p.toString()}` : '') })()}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${!chakra ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted border-border'}`}
          >
            All
          </Link>
          {CHAKRAS.map((c) => {
            const active = chakra?.toLowerCase() === c.value.toLowerCase()
            const href = (() => { const p = new URLSearchParams(); if (q) p.set('q', q); if (categorySlug) p.set('categorySlug', categorySlug); p.set('chakra', c.value); return `/store?${p.toString()}` })()
            return (
              <Link
                key={c.value}
                href={href}
                className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${active ? 'bg-purple-600 text-white border-purple-600' : 'hover:bg-muted border-border'}`}
              >
                {c.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Shop by Category */}
      {categories.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Shop Sacred Categories</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {categories.map((cat) => {
              const isActive = categorySlug === cat.slug
              const href = (() => {
                const p = new URLSearchParams()
                if (q) p.set('q', q)
                if (chakra) p.set('chakra', chakra)
                if (!isActive) p.set('categorySlug', cat.slug)
                return '/store' + (p.toString() ? `?${p.toString()}` : '')
              })()
              return (
                <Link
                  key={cat.slug}
                  href={href}
                  className={`rounded-lg border p-3 text-center transition-colors ${
                    isActive
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'hover:bg-muted border-border'
                  }`}
                >
                  <div className="text-sm font-medium">{cat.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{cat._count.products} products</div>
                </Link>
              )
            })}
          </div>
        </section>
      ) : null}

      {/* Featured Consecrated Tools */}
      {featuredTools.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-3">Featured Consecrated Tools</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {featuredTools.map((t) => (
              <Link key={t.slug} href={`/store/${t.slug}`} className="border rounded-lg p-3 hover:shadow transition-shadow">
                <div className="relative">
                  {t.imageUrl ? (
                    <Image src={t.imageUrl} alt={t.title} width={200} height={120} className="w-full h-24 object-cover rounded" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw" loading="lazy" />
                  ) : <div className="w-full h-24 bg-muted rounded" />}
                  <span className="absolute top-1.5 left-1.5 bg-amber-900/85 text-amber-100 text-[10px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                    ✨ Consecrated
                  </span>
                </div>
                <div className="mt-2 text-sm font-medium line-clamp-2">{t.title}</div>
                {t.chakra ? <div className="text-xs text-purple-600 dark:text-purple-400">{t.chakra} Chakra</div> : null}
                <div className="mt-1 text-sm">₹{(t.pricePaise / 100).toFixed(2)}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Practical guidance until customer review data is available. */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-3 text-center">Choose Tools for Your Practice</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { title: 'Start with your intention', description: 'Think about how a tool will fit into your meditation, reflection, or everyday routine.' },
            { title: 'Read the product details', description: 'Check the materials, care instructions, size, and included items before choosing.' },
            { title: 'Build a consistent practice', description: 'Choose something you can use comfortably and regularly as part of your personal practice.' },
          ].map((item) => (
            <article key={item.title} className="border rounded-lg p-4 bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 space-y-2">
              <h3 className="text-sm font-medium">{item.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {items.length === 0 ? (
        <EmptyState
          title="No products found"
          subtitle="Try a different search or category."
          action={(() => {
            const hasFilters = Boolean(q || categorySlug || chakra)
            if (!hasFilters) return null
            const qs = new URLSearchParams(Object.entries({ q: q || '', categorySlug: categorySlug || '', chakra: chakra || '' }).filter(([,v]) => v))
            const href = clearSearchParams('/store' + (qs.toString() ? `?${qs.toString()}` : ''), ['q','categorySlug','chakra'])
            return <Link href={href}><Button variant="secondary">Clear filters</Button></Link>
          })()}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
          {items.map((p) => (
            <Link href={`/store/${p.slug}`} key={p.id} className="border rounded p-4 hover:shadow focus-ring">
              <div className="relative">
                {p.imageUrl ? (
                  <Image src={p.imageUrl} alt={p.title} width={400} height={160} className="w-full h-40 object-cover rounded" sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" loading="lazy" />
                ) : <div className="w-full h-40 bg-muted rounded" />}
                {p.isConsecrated ? (
                  <span className="absolute top-2 left-2 bg-amber-900/85 text-amber-100 text-xs font-semibold px-2 py-0.5 rounded-full backdrop-blur-sm">
                    ✨ Consecrated
                  </span>
                ) : null}
              </div>
              <div className="mt-2 font-medium">{p.title}</div>
              {p.chakra ? <div className="text-xs text-purple-600 dark:text-purple-400">{p.chakra} Chakra</div> : null}
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
          {chakra ? <input type="hidden" name="chakra" value={chakra} /> : null}
          <input type="hidden" name="cursor" value={nextCursor} />
          <button className="px-4 py-2 bg-secondary text-secondary-foreground rounded focus-ring">Load more</button>
        </form>
      ) : null}
    </div>
  )
}
