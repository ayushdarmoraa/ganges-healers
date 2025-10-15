import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import HealerBookAction from "../../../components/features/services/HealerBookAction"
import BookingAutoOpen from "@/components/features/booking/BookingAutoOpen"
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import ServiceLd from '@/components/seo/ServiceLd'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeServiceCrumbs } from '@/lib/seo/breadcrumbs'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const url = canonicalOf(`/services/${slug}`, ['openBooking','programSlug'])
  // Best-effort fetch of service for title/desc; avoid throwing on not found here
  try {
    const s = await prisma.service.findUnique({ where: { slug }, select: { name: true, description: true } })
    if (!s) return { alternates: { canonical: url } }
    return {
      title: `${s.name} | Service | Ganges Healers`,
      description: s.description || undefined,
      alternates: { canonical: url },
      openGraph: { title: s.name, description: s.description || undefined, url },
      twitter: { card: 'summary_large_image', title: s.name, description: s.description || undefined },
    }
  } catch {
    return { alternates: { canonical: url } }
  }
}

// Normalize service names to specialization keys stored in healer.specializations
function specializationKey(name: string) {
  const map: Record<string, string> = {
    "Yoga Therapy": "Yoga",
    "Reiki Healing": "Reiki",
    "Tarot Reading": "Tarot",
  }
  return map[name] ?? name
}

export default async function ServiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { slug } = await params
  const sp = (await searchParams) || {}
  const openBooking = (typeof sp.openBooking === 'string' ? sp.openBooking : Array.isArray(sp.openBooking) ? sp.openBooking[0] : undefined) === '1'
  const programSlug = typeof sp.programSlug === 'string' ? sp.programSlug : Array.isArray(sp.programSlug) ? sp.programSlug[0] : undefined
  const productSlug = typeof sp.productSlug === 'string' ? sp.productSlug : Array.isArray(sp.productSlug) ? sp.productSlug[0] : undefined

  const service = await prisma.service.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      image: true,
      price: true,
      duration: true,
      category: true,
      benefits: true,
      _count: { select: { bookings: true } },
    },
  })

  if (!service) notFound()

  const crumbs = makeServiceCrumbs(slug, service?.name)

  const key = specializationKey(service.name)
  const healers = await prisma.healer.findMany({
    where: { specializations: { has: key } },
    select: {
      id: true,
      bio: true,
      experienceYears: true,
      rating: true,
      specializations: true,
      user: { select: { name: true, image: true } },
    },
    orderBy: { experienceYears: 'desc' },
  })

  type HealerResult = typeof healers[number]

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <Breadcrumbs crumbs={crumbs} />
      <BreadcrumbsLd crumbs={crumbs} />
      <ServiceLd service={{ slug: service.slug, title: service.name, shortDescription: service.description ?? undefined, pricePaise: typeof service.price === 'number' ? service.price * 100 : undefined, imageUrl: service.image ?? undefined }} />
      {openBooking && healers[0] ? (
        <BookingAutoOpen
          enabled={true}
          programSlug={programSlug}
          productSlug={productSlug}
          serviceSlug={service.slug}
          healer={{ id: healers[0].id, name: healers[0].user?.name ?? 'Healer', experienceYears: healers[0].experienceYears, rating: healers[0].rating ?? 5 }}
          serviceId={service.id}
          serviceName={service.name}
        />
      ) : null}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <div className="relative h-64 w-full">
            <Image
              src={service.image ?? "/vercel.svg"}
              alt={service.name}
              fill
              className="object-cover"
            />
          </div>
          <CardContent className="p-6 space-y-4">
            <Link href="/services" className="text-sm text-purple-600 hover:underline">← Back to services</Link>
            <h1 className="text-3xl font-semibold">{service.name}</h1>
            <p className="text-gray-600 text-sm leading-relaxed">
              {service.description}
            </p>
            <div className="flex flex-wrap gap-4 text-sm text-gray-600">
              <span><strong className="text-gray-800">₹{service.price}</strong> / session</span>
              <span>Duration: {service.duration} min</span>
              <span>Bookings: {service._count.bookings}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-3">
            <h2 className="text-xl font-semibold">About this service</h2>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
              <li>Certified healers with practical experience</li>
              <li>Slots available 10:00–20:00 IST</li>
              <li>30‑minute increments • Reschedule ≥24h</li>
            </ul>
            {Array.isArray(service.benefits) && service.benefits.length > 0 && (
              <div className="pt-2">
                <h3 className="font-medium text-sm mb-1">Potential Benefits</h3>
                <ul className="list-disc pl-5 text-xs text-gray-600 space-y-0.5">
                  {(service.benefits as string[]).slice(0,6).map(b => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="pt-2">
              <Link href="/services"><Button variant="outline" size="sm">Browse all services</Button></Link>
              <Link href={`/healers?serviceSlug=${service.slug}`} className="ml-2"><Button variant="outline" size="sm">View all healers</Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Healers offering {service.name}</h2>
          <span className="text-sm text-gray-500">{healers.length} available</span>
        </div>
        {healers.length === 0 ? (
          <p className="text-gray-500 text-sm">No healers published for this service yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {healers.map((h: HealerResult) => {
              const name = h.user?.name ?? 'Healer'
              return (
                <Card key={h.id} className="h-full" data-test="healer-card">
                  <CardContent className="p-5 space-y-3">
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-gray-500">{h.experienceYears} yrs experience • Rating {(h.rating ?? 5).toFixed(1)}</div>
                    {h.bio && <p className="text-sm text-gray-600 line-clamp-3">{h.bio}</p>}
                    {h.specializations?.length ? (
                      <div className="flex flex-wrap gap-2">
                        {h.specializations.slice(0,4).map((s: string) => (
                          <span key={s} className="text-xs rounded bg-gray-100 px-2 py-1 text-gray-600">{s}</span>
                        ))}
                      </div>
                    ) : null}
                    <HealerBookAction healer={{ id: h.id, name, experienceYears: h.experienceYears, rating: h.rating ?? 5 }} serviceId={service.id} serviceName={service.name} />
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}