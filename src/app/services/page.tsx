// app/services/page.tsx
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import ServicesGrid from '@/components/services/ServicesGrid'
import ServicesFilter from '@/components/services/ServicesFilter'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Healing Services | Ganges Healers',
  description: 'Explore our range of healing services including Reiki, Hypnotherapy, Yoga Therapy, and more.'
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
  averageRating: number
  totalSessions: number
  totalReviews: number
}

async function getServices(params: Record<string, string | string[] | undefined>): Promise<UiService[]> {
  const { category, minPrice, maxPrice, search, q } = params

  const where: {
    isActive: true
    category?: string
    price?: { gte?: number; lte?: number }
    OR?: Array<{ name?: { contains: string; mode: 'insensitive' }; description?: { contains: string; mode: 'insensitive' } }>
  } = { isActive: true }

  if (category) where.category = String(category)

  if (minPrice || maxPrice) {
    const priceFilter: { gte?: number; lte?: number } = {}
    if (minPrice) priceFilter.gte = Number(minPrice)
    if (maxPrice) priceFilter.lte = Number(maxPrice)
    if (Object.keys(priceFilter).length) {
      where.price = priceFilter
    }
  }

  const text = (search || q) && String(search || q)
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

  // We removed reviews from MVP; synthesize rating/reviews as neutral defaults
  return services.map((s: RawService): UiService => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    description: s.description,
    category: s.category,
    image: s.image ?? undefined,
    price: s.price,
    duration: s.duration,
    averageRating: 5.0, // placeholder neutral high rating until review system exists
    totalSessions: s._count.bookings,
    totalReviews: 0
  }))
}

export default async function ServicesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const services = await getServices(params)
  
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
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <aside className="lg:w-64">
            <Suspense fallback={<div>Loading filters...</div>}>
              <ServicesFilter />
            </Suspense>
          </aside>
          
          {/* Services Grid */}
          <main className="flex-1">
            {services.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No services found matching your criteria.</p>
              </div>
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