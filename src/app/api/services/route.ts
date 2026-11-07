// src/app/api/services/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/rbac'
import { cached } from '@/lib/cache'
import { createServiceSchema } from '@/lib/services/catalog-schema'
import { parseCatalogPrice, parseMinimumServiceRating } from '@/lib/services/catalog-filters'

function readSingle(params: URLSearchParams, name: string) {
  const values = params.getAll(name)
  return values.length === 1 ? values[0] : undefined
}

function positiveInteger(value: string | undefined, fallback: number) {
  const number = value && /^\d+$/.test(value) ? Number(value) : NaN
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')
    const minPrice = parseCatalogPrice(readSingle(searchParams, 'minPrice'))
    const maxPrice = parseCatalogPrice(readSingle(searchParams, 'maxPrice'))
    const minRating = parseMinimumServiceRating(readSingle(searchParams, 'minRating'))
    const search = searchParams.get('search')
    const mode = searchParams.get('mode')?.toUpperCase()
    const limit = Math.min(positiveInteger(readSingle(searchParams, 'limit'), 12), 100)
    const requestedPage = positiveInteger(readSingle(searchParams, 'page'), 1)
    const page = (requestedPage - 1) * limit <= 2_147_483_647 ? requestedPage : 1
    const where: Prisma.ServiceWhereInput = { isActive: true }

    if (category) where.category = category
    if (mode === 'ONLINE' || mode === 'OFFLINE' || mode === 'BOTH') where.mode = mode
    
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = { gte: minPrice, lte: maxPrice }
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tagline: { contains: search, mode: 'insensitive' } }
      ]
    }

    const load = async (filter: Prisma.ServiceWhereInput) => {
      const [services, total] = await Promise.all([
        prisma.service.findMany({
          where: filter,
          include: { _count: { select: { bookings: true } } },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ popularity: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        }),
        prisma.service.count({ where: filter }),
      ])
      return { services, total }
    }
    let result
    if (minRating === undefined) {
      const cacheKey = `services:${JSON.stringify(where)}:${page}:${limit}`
      result = await cached(cacheKey, () => load(where))
    } else {
      // Apply the review threshold before pagination and use current reviews.
      const qualifying = await prisma.review.groupBy({
        by: ['serviceId'],
        where: { service: where },
        having: { rating: { _avg: { gte: minRating } } },
      })
      result = qualifying.length
        ? await load({ ...where, id: { in: qualifying.map(row => row.serviceId) } })
        : { services: [], total: 0 }
    }

    return NextResponse.json({
      success: true,
      data: result.services,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
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

    const body: unknown = await request.json().catch(() => undefined)
    if (body === undefined) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    const fields = createServiceSchema.safeParse(body)
    if (!fields.success) {
      const missing = typeof body === 'object' && body !== null &&
        ['name', 'description', 'category', 'price', 'duration'].some(key => !Object.hasOwn(body, key))
      return NextResponse.json({ error: missing ? 'Missing required fields' : 'Invalid service fields' }, { status: 400 })
    }

    const service = await prisma.service.create({
      data: { ...fields.data, isActive: true },
    })

    return NextResponse.json({ success: true, data: service }, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'Service already exists' }, { status: 409 })
    }
    console.error('Service creation error:', error)
    return NextResponse.json({ error: 'Failed to create service' }, { status: 500 })
  }
}
