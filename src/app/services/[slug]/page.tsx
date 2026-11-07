import { notFound } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Calendar, TrendingUp } from "lucide-react"
import HealerCard from "@/components/features/services/HealerCard"
import BookingAutoOpen from "@/components/features/booking/BookingAutoOpen"
import ServiceHowItWorks from "@/components/features/services/ServiceHowItWorks"
import ServiceRefundPolicy from "@/components/features/services/ServiceRefundPolicy"
import ReviewsSection from "@/components/features/services/ReviewsSection"
import RelatedServices from "@/components/features/services/RelatedServices"
import ServiceFAQ from "@/components/features/services/ServiceFAQ"
import InternalLinks from "@/components/features/services/InternalLinks"
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import ServiceLd from '@/components/seo/ServiceLd'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeServiceCrumbs } from '@/lib/seo/breadcrumbs'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const url = canonicalOf(`/services/${slug}`, ['openBooking','programSlug','healerId'])
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
  const requestedHealerId = typeof sp.healerId === 'string' ? sp.healerId : undefined
  const hasRequestedHealer = sp.healerId !== undefined

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
      mode: true,
      benefits: true,
      _count: { select: { bookings: true } },
    },
  })

  if (!service) notFound()

  const crumbs = makeServiceCrumbs(slug, service?.name)
  const key = specializationKey(service.name)

  // Fetch healers, reviews, and monthly booking count in parallel
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const [healers, reviews, monthlyBookings, sacredTools] = await Promise.all([
    prisma.healer.findMany({
      where: { isActive: true, specializations: { has: key } },
      select: {
        id: true,
        bio: true,
        experienceYears: true,
        rating: true,
        specializations: true,
        isVerified: true,
        availability: true,
        user: { select: { name: true, image: true } },
        _count: { select: { reviews: true } },
      },
      orderBy: { experienceYears: 'desc' },
    }),
    prisma.review.findMany({
      where: { serviceId: service.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        rating: true,
        comment: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.booking.count({
      where: {
        serviceId: service.id,
        createdAt: { gte: monthStart },
      },
    }),
    prisma.product.findMany({
      where: { serviceId: service.id, isActive: true },
      select: {
        slug: true,
        title: true,
        pricePaise: true,
        imageUrl: true,
        isConsecrated: true,
        chakra: true,
      },
      take: 6,
      orderBy: { createdAt: 'desc' },
    }),
  ])

  // Compute review stats for SEO schema
  const reviewAgg = await prisma.review.aggregate({
    where: { serviceId: service.id },
    _avg: { rating: true },
    _count: { rating: true },
  })
  const avgRating = reviewAgg._avg.rating
  const totalReviews = reviewAgg._count.rating

  // Prepare healer data for client components
  const healerData = healers.map((h) => ({
    ...h,
    availability: h.availability as Record<string, { start: string; end: string }> | null,
    rating: h.rating ?? 0,
    reviewCount: h._count.reviews,
  }))
  const bookingHealer = hasRequestedHealer ? healerData.find(healer => healer.id === requestedHealerId) : healerData[0]

  // Category-specific long-form content
  const categoryLabel = (service.category ?? "General").replace(/_/g, " ")
  const altText = `${service.name} healing session — ${categoryLabel.toLowerCase()} for wellness and transformation`

  return (
    <div className="container mx-auto px-4 py-8 space-y-10">
      <Breadcrumbs crumbs={crumbs} />
      <BreadcrumbsLd crumbs={crumbs} />
      <ServiceLd
        service={{
          slug: service.slug,
          title: service.name,
          shortDescription: service.description ?? undefined,
          pricePaise: typeof service.price === 'number' ? service.price * 100 : undefined,
          ratingAvg: avgRating ?? undefined,
          ratingCount: totalReviews > 0 ? totalReviews : undefined,
          imageUrl: service.image ?? undefined,
        }}
      />

      {openBooking && hasRequestedHealer && !bookingHealer ? (
        <p role="alert" className="rounded-lg border border-input bg-muted p-4 text-sm">The selected healer is unavailable for this service. Please choose an available healer below.</p>
      ) : null}
      {openBooking && bookingHealer ? (
        <BookingAutoOpen
          key={bookingHealer.id}
          enabled={true}
          programSlug={programSlug}
          productSlug={productSlug}
          serviceSlug={service.slug}
          healer={{ id: bookingHealer.id, name: bookingHealer.user?.name ?? 'Healer', experienceYears: bookingHealer.experienceYears, rating: bookingHealer.reviewCount > 0 ? bookingHealer.rating : 0 }}
          serviceId={service.id}
          serviceName={service.name}
        />
      ) : null}

      {/* ── Hero: Service Info ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <div className="relative h-64 w-full">
            <Image
              src={service.image ?? "/vercel.svg"}
              alt={altText}
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
              <span>{service._count.bookings} total bookings</span>
            </div>

            {/* Urgency signals */}
            <div className="flex flex-wrap gap-3">
              {monthlyBookings > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <TrendingUp className="h-3 w-3" />
                  Booked {monthlyBookings} times this month
                </Badge>
              )}
              {healers.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Calendar className="h-3 w-3" />
                  {healers.length} healer{healers.length > 1 ? "s" : ""} available
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Service-specific content */}
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-xl font-semibold">What is {service.name}?</h2>
              <p className="text-sm text-gray-600 leading-relaxed">{service.description}</p>

              {Array.isArray(service.benefits) && service.benefits.length > 0 && (
                <div>
                  <h3 className="font-medium text-sm mb-2">Benefits of {service.name}</h3>
                  <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                    {(service.benefits as string[]).slice(0, 8).map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="font-medium text-sm mb-2">Who is this session for?</h3>
                <p className="text-sm text-gray-600">
                  This session is ideal for anyone seeking support with {categoryLabel.toLowerCase()} related
                  challenges. Whether you are new to healing or have prior experience, our practitioners
                  tailor each session to your specific needs and goals.
                </p>
              </div>

              <div className="pt-2 flex gap-2">
                <Link href="/services"><Button variant="outline" size="sm">Browse all services</Button></Link>
                <Link href={`/healers?serviceSlug=${service.slug}`}><Button variant="outline" size="sm">View all healers</Button></Link>
              </div>
            </CardContent>
          </Card>

          {/* Refund policy */}
          <ServiceRefundPolicy />
        </div>
      </div>

      {/* ── How It Works ──────────────────────────────────── */}
      <ServiceHowItWorks />

      {/* ── Healers ───────────────────────────────────────── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Healers offering {service.name}</h2>
          <span className="text-sm text-gray-500">{healerData.length} available</span>
        </div>
        {healerData.length === 0 ? (
          <p className="text-gray-500 text-sm">No healers published for this service yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {healerData.map((h) => (
              <HealerCard
                key={h.id}
                healer={h}
                serviceId={service.id}
                serviceName={service.name}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Reviews ───────────────────────────────────────── */}
      <ReviewsSection reviews={reviews} avgRating={avgRating} totalCount={totalReviews} />

      {/* ── FAQ ───────────────────────────────────────────── */}
      <ServiceFAQ
        serviceName={service.name}
        serviceSlug={service.slug}
        duration={service.duration}
        price={service.price}
        mode={service.mode}
      />

      {/* ── Sacred Tools Cross-Sell ────────────────────── */}
      {sacredTools.length > 0 ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">Sacred Tools for This Healing</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {sacredTools.map((tool) => (
              <Link key={tool.slug} href={`/store/${tool.slug}`} className="border rounded-lg p-3 hover:shadow transition-shadow">
                <div className="relative">
                  {tool.imageUrl ? (
                    <Image src={tool.imageUrl} alt={tool.title} width={200} height={120} className="w-full h-28 object-cover rounded" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" loading="lazy" />
                  ) : <div className="w-full h-28 bg-muted rounded" />}
                  {tool.isConsecrated ? (
                    <span className="absolute top-1.5 left-1.5 bg-amber-900/85 text-amber-100 text-[10px] font-semibold px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                      ✨ Consecrated
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-sm font-medium line-clamp-2">{tool.title}</div>
                {tool.chakra ? <div className="text-xs text-purple-600 dark:text-purple-400">{tool.chakra} Chakra</div> : null}
                <div className="mt-1 text-sm">₹{(tool.pricePaise / 100).toFixed(2)}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Related Services ──────────────────────────────── */}
      <RelatedServices currentServiceId={service.id} category={service.category} />

      {/* ── Internal Links (blog, audio, programs, community) */}
      <InternalLinks serviceName={service.name} category={service.category} />
    </div>
  )
}
