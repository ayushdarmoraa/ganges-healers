import { getProgramBySlug } from '@/lib/programs/queries'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import ProgramLd from '@/components/seo/ProgramLd'
import ProgramEnrollSoon from '@/components/features/programs/ProgramEnrollSoon'
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeProgramCrumbs } from '@/lib/seo/breadcrumbs'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getProgramBySlug(slug)
  if (!p) return {}
  return {
    title: `${p.title} | Program | Ganges Healers`,
    description: p.shortDescription,
    alternates: { canonical: canonicalOf(`/programs/${p.slug}`) },
    openGraph: { title: p.title, description: p.shortDescription, url: canonicalOf(`/programs/${p.slug}`) },
    twitter: { card: 'summary_large_image', title: p.title, description: p.shortDescription },
  }
}

export default async function ProgramDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await getProgramBySlug(slug)
  if (!p) return notFound()
  const crumbs = makeProgramCrumbs(slug, p.title)
  return (
    <div className="container mx-auto p-6">
      <Breadcrumbs crumbs={crumbs} />
      <BreadcrumbsLd crumbs={crumbs} />
      <ProgramLd program={p} />
      <h1 className="text-3xl font-semibold">{p.title}</h1>
      <div className="mt-2 text-sm text-muted-foreground">Sessions: {p.sessionsCount} • Price: ₹{(p.pricePaise/100).toFixed(2)}</div>
      <ProgramEnrollSoon programSlug={p.slug} serviceSlug={p.serviceSlug ?? undefined} />
      {p.serviceSlug ? (
        <div className="mt-4">
          <Link href={`/services/${p.serviceSlug}?openBooking=1&programSlug=${encodeURIComponent(p.slug)}`}>
            <Button className="bg-purple-600 hover:bg-purple-700">Book a session for this program</Button>
          </Link>
        </div>
      ) : null}
      <div className="prose mt-4 whitespace-pre-wrap">{p.longDescription}</div>
    </div>
  )
}
