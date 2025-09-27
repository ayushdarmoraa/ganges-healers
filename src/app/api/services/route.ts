// src/app/api/services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const search = searchParams.get('search')
    const mode = searchParams.get('mode')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')

    interface SearchFilter { contains: string; mode: 'insensitive' }
    type ServiceModeLiteral = 'ONLINE' | 'OFFLINE' | 'BOTH'
    const where = {
      isActive: true as const,
    } as {
      isActive: true
      category?: string
      mode?: ServiceModeLiteral
      price?: { gte?: number; lte?: number }
      OR?: Array<{ name?: SearchFilter; description?: SearchFilter; tagline?: SearchFilter }>
    }

    if (category) where.category = category
    if (mode) {
      const upperMode = mode.toUpperCase()
      if (['ONLINE','OFFLINE','BOTH'].includes(upperMode)) {
        where.mode = upperMode as ServiceModeLiteral
      }
    }
    
    if (minPrice || maxPrice) {
      where.price = {}
      if (minPrice) where.price.gte = parseFloat(minPrice)
      if (maxPrice) where.price.lte = parseFloat(maxPrice)
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tagline: { contains: search, mode: 'insensitive' } }
      ]
    }

  // Localized escape hatch: Prisma client generated types are verbose; shape validated by construction above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaWhere: any = where
    const [services, total] = await Promise.all([
      prisma.service.findMany({ where: prismaWhere,
        include: {
          _count: {
            select: { bookings: true }
          }
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [
          { popularity: 'desc' },
          { name: 'asc' }
        ]
      }),
  prisma.service.count({ where: prismaWhere })
    ])

    return NextResponse.json({
      success: true,
      data: services,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    console.error('Services fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch services' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAdmin()
    } catch (e: unknown) {
      const status = typeof e === 'object' && e && 'status' in e ? (e as { status?: number }).status : 403
      return NextResponse.json({ error: 'Forbidden' }, { status: status ?? 403 })
    }

    const body = await request.json()
    const { name, description, tagline, category, price, duration, image, mode = 'BOTH', benefits = [] } = body

    if (!name || !description || !category || !price || !duration) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    
    const existing = await prisma.service.findUnique({ where: { slug } })
    if (existing) {
      return NextResponse.json({ error: 'Service already exists' }, { status: 409 })
    }

    const service = await prisma.service.create({
      data: {
        name,
        slug,
        description,
        tagline,
        category,
        price: parseFloat(price),
        duration: parseInt(duration),
        image,
        mode,
        benefits: benefits.length > 0 ? benefits : undefined,
        isActive: true
      }
    })

    return NextResponse.json({ success: true, data: service }, { status: 201 })
  } catch (error) {
    console.error('Service creation error:', error)
    return NextResponse.json({ error: 'Failed to create service' }, { status: 500 })
  }
}