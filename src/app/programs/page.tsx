import { listPrograms } from '@/lib/programs/queries'
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeProgramsIndexCrumbs } from '@/lib/seo/breadcrumbs'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Programs | Ganges Healers',
    description: 'Guided multi-session programs to support your healing journey.',
    alternates: { canonical: canonicalOf('/programs') },
  }
}

export default async function ProgramsPage() {
  const { items } = await listPrograms({ limit: 20 })
  return (
    <div className="container mx-auto p-6">
      {(() => { const crumbs = makeProgramsIndexCrumbs(); return (<>
        <Breadcrumbs crumbs={crumbs} />
        <BreadcrumbsLd crumbs={crumbs} />
      </>) })()}
      <h1 className="text-2xl font-semibold mb-4">Programs</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((p) => (
          <a key={p.id} href={`/programs/${p.slug}`} className="block rounded border p-4 hover:shadow-sm">
            <div className="font-medium text-lg">{p.title}</div>
            <div className="text-sm text-muted-foreground mt-1">{p.shortDescription}</div>
            <div className="mt-2 text-sm">Sessions: {p.sessionsCount}</div>
            <div className="mt-1 font-semibold">₹{(p.pricePaise / 100).toFixed(2)}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
