import { isTestMode } from '@/lib/test-mode'
// src/app/api/services/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const service = await prisma.service.findUnique({
      where: { id },
      select: {
        id: true, name: true, slug: true, description: true, tagline: true,
        category: true, price: true, duration: true, image: true, mode: true,
        benefits: true, isActive: true, popularity: true, createdAt: true, updatedAt: true,
        bookings: {
          where: { status: 'COMPLETED', healer: { isActive: true } },
          select: {
            healer: {
              select: {
                id: true, bio: true, experienceYears: true, rating: true,
                specializations: true, isVerified: true,
                user: { select: { name: true, image: true } },
              }
            }
          },
          distinct: ['healerId']
        },
        _count: {
          select: { bookings: true }
        }
      }
    })

    if (!service || !service.isActive) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    // Keep both projections explicit: ORM rows must never become a public booking or account export.
    const healers = [...new Map(service.bookings.map(({ healer }) => [healer.id, {
      id: healer.id, bio: healer.bio, experienceYears: healer.experienceYears,
      rating: healer.rating, specializations: healer.specializations, isVerified: healer.isVerified,
      user: { name: healer.user.name, image: healer.user.image },
    }])).values()]
    const reviews = await prisma.review.aggregate({ where: { serviceId: service.id }, _avg: { rating: true }, _count: { rating: true } })

    return NextResponse.json({
      success: true,
      data: {
        id: service.id, name: service.name, slug: service.slug, description: service.description,
        tagline: service.tagline, category: service.category, price: service.price, duration: service.duration,
        image: service.image, mode: service.mode, benefits: service.benefits, isActive: service.isActive,
        popularity: service.popularity, createdAt: service.createdAt, updatedAt: service.updatedAt,
        _count: { bookings: service._count.bookings },
        // Compatibility: retain this legacy array with public healer summaries only.
        bookings: healers.map(healer => ({ healer })),
        healers,
        averageRating: Math.round((reviews._avg.rating ?? 0) * 10) / 10,
        totalReviews: reviews._count.rating,
        totalBookings: service._count.bookings
      }
    })
  } catch (error) {
    console.error('Service fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch service' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAdmin()
    } catch (e: unknown) {
      const status = typeof e === 'object' && e && 'status' in e ? (e as { status?: number }).status : 403
      return NextResponse.json({ error: 'Forbidden' }, { status: status ?? 403 })
    }

    const { id } = await params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- admin body spread into Prisma update
    let body: any
    if (isTestMode()) {
      const raw = await request.text().catch(() => '')
      console.debug('[TEST_MODE] /api/services/[id] PUT raw body:', raw || '(none)')
      try {
        body = raw ? JSON.parse(raw) : {}
      } catch (err) {
        console.error('[TEST_MODE] JSON parse failed for /api/services/[id] PUT', err, 'raw:', raw)
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
      }
    } else {
      body = await request.json()
    }

    const service = await prisma.service.update({
      where: { id },
      data: { ...body, updatedAt: new Date() }
    })

    return NextResponse.json({ success: true, data: service })
  } catch (error) {
    console.error('Service update error:', error)
    return NextResponse.json({ error: 'Failed to update service' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    try {
      await requireAdmin()
    } catch (e: unknown) {
      const status = typeof e === 'object' && e && 'status' in e ? (e as { status?: number }).status : 403
      return NextResponse.json({ error: 'Forbidden' }, { status: status ?? 403 })
    }

    const { id } = await params
    
    // Soft delete - just mark as inactive
    await prisma.service.update({
      where: { id },
      data: { isActive: false }
    })

    return NextResponse.json({ success: true, message: 'Service deactivated' })
  } catch (error) {
    console.error('Service delete error:', error)
    return NextResponse.json({ error: 'Failed to delete service' }, { status: 500 })
  }
}
