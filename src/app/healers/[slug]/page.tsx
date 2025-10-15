import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getHealerBySlug } from '@/lib/healers/queries'
import HealerLd from '@/components/seo/HealerLd'
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeHealerCrumbs } from '@/lib/seo/breadcrumbs'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const h = await getHealerBySlug(slug)
  if (!h) return {}
  const desc = h.shortBio || `${h.title || 'Healer'} with ${h.yearsExperience} years experience.`
  const url = canonicalOf(`/healers/${h.slug}`)
  return {
    title: `${h.name} | Healer | Ganges Healers`,
    description: desc,
    alternates: { canonical: url },
    openGraph: { title: h.name, description: desc, url },
    twitter: { card: 'summary', title: h.name, description: desc },
  }
}

export default async function HealerDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const h = await getHealerBySlug(slug)
  if (!h) return notFound()
  const crumbs = makeHealerCrumbs(slug, h.name)

  const primaryService = h.services?.[0]

  return (
    <div className="container mx-auto p-6 space-y-4">
      <Breadcrumbs crumbs={crumbs} />
      <BreadcrumbsLd crumbs={crumbs} />
      <HealerLd healer={{ slug: h.slug, name: h.name, title: h.title, shortBio: h.shortBio, languages: h.languages ?? undefined }} />
      <h1 className="text-3xl font-semibold">{h.name}</h1>
      <div className="text-sm text-muted-foreground">{h.title || 'Healer'} • {h.yearsExperience} yrs • ⭐ {h.ratingAvg.toFixed(1)}</div>
      {primaryService ? (
        <div>
          <Link href={`/services/${primaryService.slug}?openBooking=1`} className="border rounded px-3 py-2 inline-block">Book a session</Link>
        </div>
      ) : null}
      <section>
        <h2 className="text-xl font-semibold">About</h2>
        <p className="mt-2 whitespace-pre-wrap">{h.longBio}</p>
      </section>
      {h.certifications?.length ? (
        <section>
          <h2 className="text-xl font-semibold">Certifications</h2>
          <ul className="list-disc pl-5 mt-2">
            {h.certifications.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>
      ) : null}
      {h.languages?.length ? (
        <section>
          <h2 className="text-xl font-semibold">Languages</h2>
          <div className="flex flex-wrap gap-2 mt-2">
            {h.languages.map((l) => <span key={l} className="text-xs rounded bg-gray-100 px-2 py-1 text-gray-600">{l}</span>)}
          </div>
        </section>
      ) : null}
      {h.gallery?.length ? (
        <section>
          <h2 className="text-xl font-semibold">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
            {h.gallery.map((src) => (
              <div key={src} className="relative w-full aspect-square">
                <Image src={src} alt="Gallery" fill className="object-cover rounded" />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
