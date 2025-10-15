import Link from 'next/link'
import { listHealers } from '@/lib/healers/queries'
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeHealersIndexCrumbs } from '@/lib/seo/breadcrumbs'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Healers | Ganges Healers',
    description: 'Browse our directory of certified healers across modalities like Yoga, Reiki, Tarot, and more.',
    alternates: { canonical: canonicalOf('/healers') },
  }
}

export default async function HealersPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) || {}
  const q = typeof sp.q === 'string' ? sp.q : undefined
  const serviceSlug = typeof sp.serviceSlug === 'string' ? sp.serviceSlug : undefined
  const cursor = typeof sp.cursor === 'string' ? sp.cursor : undefined
  const { items, nextCursor } = await listHealers({ q, serviceSlug, cursor, limit: 20 })

  return (
    <div className="container mx-auto p-6 space-y-6">
      {(() => { const crumbs = makeHealersIndexCrumbs(); return (<>
        <Breadcrumbs crumbs={crumbs} />
        <BreadcrumbsLd crumbs={crumbs} />
      </>) })()}
      <h1 className="text-2xl font-semibold">Healers</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search healers" className="border rounded px-3 py-2 flex-1" />
        <input name="serviceSlug" defaultValue={serviceSlug} placeholder="Service slug (optional)" className="border rounded px-3 py-2" />
        <button type="submit" className="border rounded px-3 py-2">Search</button>
      </form>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No healers found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(h => (
            <div key={h.id} className="border rounded p-4">
              <div className="font-medium text-lg"><Link href={`/healers/${h.slug}`}>{h.name}</Link></div>
              <div className="text-sm text-muted-foreground">{h.title || 'Healer'} • {h.yearsExperience} yrs • ⭐ {h.ratingAvg.toFixed(1)}</div>
              <div className="mt-2 text-sm line-clamp-3">{h.shortBio}</div>
              {h.services?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {h.services.map(s => (
                    <Link key={s.slug} href={`/services/${s.slug}`} className="text-xs rounded bg-gray-100 px-2 py-1 text-gray-600">{s.title}</Link>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {nextCursor ? (
        <div className="pt-2">
          <Link href={`/healers?${new URLSearchParams({ ...(q ? { q } : {}), ...(serviceSlug ? { serviceSlug } : {}), cursor: nextCursor }).toString()}`} className="border rounded px-3 py-2 inline-block">Load more</Link>
        </div>
      ) : null}
    </div>
  )
}
