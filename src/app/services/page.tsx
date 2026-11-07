// app/services/page.tsx
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import ServicesGrid from '@/components/services/ServicesGrid'
import EmptyState from '@/components/empty/EmptyState'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import ServicesFilter from '@/components/services/ServicesFilter'
import { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeServicesIndexCrumbs } from '@/lib/seo/breadcrumbs'
import { parseCatalogPrice, parseMinimumServiceRating } from '@/lib/services/catalog-filters'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Services | Ganges Healers',
    description: 'Explore our range of healing services including Reiki, Hypnotherapy, Yoga Therapy, and more.',
    alternates: { canonical: canonicalOf('/services') },
  }
}

// Keep this dynamic to ensure fresh filtering (or switch to awaited searchParams param style)
export const dynamic = 'force-dynamic'

interface RawService {
  id: string
  name: string
  slug: string
  description: string
  category: string
  image: string | null
  price: number
  duration: number
  _count: { bookings: number }
}

interface UiService {
  id: string
  name: string
  slug: string
  description: string
  category: string
  image?: string
  price: number
  duration: number
  averageRating: number | null
  totalSessions: number
  totalReviews: number
}

async function getServices(params: Record<string, string | string[] | undefined>, minimumRating: number | undefined): Promise<UiService[]> {
  const single = (value: string | string[] | undefined) => typeof value === 'string' ? value.trim() : ''
  const category = single(params.category)
  const text = (single(params.search) || single(params.q)).slice(0, 200)
  const minPrice = parseCatalogPrice(params.minPrice)
  const maxPrice = parseCatalogPrice(params.maxPrice)

  const where: {
    isActive: true
    category?: string
    price?: { gte?: number; lte?: number }
    OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; description?: { contains: string; mode: 'insensitive' } }>
  } = { isActive: true }

  if (category) where.category = category

  if (minPrice !== undefined || maxPrice !== undefined) {
    const priceFilter: { gte?: number; lte?: number } = {}
    if (minPrice !== undefined) priceFilter.gte = minPrice
    if (maxPrice !== undefined) priceFilter.lte = maxPrice
    if (Object.keys(priceFilter).length) {
      where.price = priceFilter
    }
  }

  if (text) {
    where.OR = [
      { name: { contains: text, mode: 'insensitive' } },
      { description: { contains: text, mode: 'insensitive' } }
    ]
  }

  const services: RawService[] = await prisma.service.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      category: true,
      image: true,
      price: true,
      duration: true,
      _count: { select: { bookings: true } }
    }
  })

  // One aggregate query for the catalog, rather than one query per service.
  const aggregates = services.length ? await prisma.review.groupBy({
    by: ['serviceId'], where: { serviceId: { in: services.map(service => service.id) } },
    _avg: { rating: true }, _count: { rating: true },
  }) : []
  const ratings = new Map(aggregates.map(row => [row.serviceId, row]))
  return services.map((s: RawService): UiService => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    category: s.category,
    image: s.image ?? undefined,
    price: s.price,
    duration: s.duration,
    averageRating: ratings.get(s.id)?._avg.rating ?? null,
    totalSessions: s._count.bookings,
    totalReviews: ratings.get(s.id)?._count.rating ?? 0
  })).filter(service => minimumRating === undefined || (service.averageRating !== null && service.averageRating >= minimumRating))
}

export default async function ServicesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const minimumRating = parseMinimumServiceRating(params.minRating)
  const [services, categoryRows] = await Promise.all([
    getServices(params, minimumRating),
    prisma.service.findMany({ where: { isActive: true }, select: { category: true }, distinct: ['category'], orderBy: { category: 'asc' } }),
  ])
  const categories = categoryRows.map(row => row.category).filter(Boolean)
  const filterKeys = ['category', 'search', 'q', 'minPrice', 'maxPrice'] as const
  const hasFilters = minimumRating !== undefined || filterKeys.some(key => Boolean(params[key]))
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="container mx-auto px-4 py-16">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Our Healing Services
          </h1>
          <p className="text-xl text-purple-100 max-w-2xl">
            Discover transformative healing modalities guided by certified practitioners. 
            Your journey to wellness starts here.
          </p>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        {(() => { const crumbs = makeServicesIndexCrumbs(); return (<>
          <Breadcrumbs crumbs={crumbs} />
          <BreadcrumbsLd crumbs={crumbs} />
        </>) })()}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <aside className="lg:w-64">
            <Suspense fallback={<div>Loading filters...</div>}>
              <ServicesFilter key={JSON.stringify([...filterKeys.map(key => params[key]), minimumRating])} categories={categories} minimumRating={minimumRating} />
            </Suspense>
          </aside>
          
          {/* Services Grid */}
          <main className="flex-1">
            {services.length === 0 ? (
              <EmptyState
                title={hasFilters ? 'No matching services' : 'No services yet'}
                subtitle={hasFilters ? 'Try another search or clear the filters to see all available services.' : 'Check back soon.'}
                action={hasFilters ? <Link href="/services"><Button variant="secondary">Clear filters</Button></Link> : null}
              />
            ) : (
              <>
                <div className="mb-4 flex justify-between items-center">
                  <p className="text-gray-600">
                    Showing {services.length} service{services.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <ServicesGrid services={services} />
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
