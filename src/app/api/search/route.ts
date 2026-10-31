import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cached } from '@/lib/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Sanitize a search query for PostgreSQL tsquery.
 * Splits into words and joins with & (AND) for ranked full-text search.
 */
function toTsquery(q: string): string {
  return q
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `${w}:*`)
    .join(' & ')
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.trim()

    if (!q || q.length < 2) {
      return NextResponse.json({
        services: [],
        healers: [],
        programs: [],
        courses: [],
        products: [],
        blog: [],
        audio: [],
      })
    }

    const tsquery = toTsquery(q)
    // Fallback to LIKE if the query can't produce a valid tsquery (e.g. only special chars)
    const useFTS = tsquery.length > 0

    if (!useFTS) {
      return NextResponse.json({
        services: [],
        healers: [],
        programs: [],
        courses: [],
        products: [],
        blog: [],
        audio: [],
      })
    }

    const freshBlog = prisma.$queryRawUnsafe<Array<{ id: string; slug: string; title: string; excerpt: string | null; createdAt: Date }>>(
      `SELECT id, slug, title, excerpt, "createdAt" FROM "BlogPost"
       WHERE published = true AND "searchVector" @@ to_tsquery('english', $1)
       ORDER BY ts_rank("searchVector", to_tsquery('english', $1)) DESC
       LIMIT 10`,
      tsquery,
    )
    const cachedResults = cached(`search:${tsquery}`, async () => {
      const [services, healers, programs, courses, products, audio] =
      await Promise.all([
        prisma.$queryRawUnsafe<Array<{ id: string; slug: string; name: string; category: string; tagline: string | null }>>(
          `SELECT id, slug, name, category, tagline FROM "Service"
           WHERE "isActive" = true AND "searchVector" @@ to_tsquery('english', $1)
           ORDER BY ts_rank("searchVector", to_tsquery('english', $1)) DESC
           LIMIT 10`,
          tsquery
        ),
        prisma.$queryRawUnsafe<Array<{ id: string; bio: string | null; specializations: string[]; userName: string | null; userImage: string | null }>>(
          `SELECT h.id, h.bio, h.specializations, u.name AS "userName", u.image AS "userImage"
           FROM "Healer" h JOIN "User" u ON h."userId" = u.id
           WHERE h."isActive" = true AND (
             h."searchVector" @@ to_tsquery('english', $1)
             OR u.name ILIKE '%' || $2 || '%'
           )
           LIMIT 10`,
          tsquery, q
        ),
        prisma.$queryRawUnsafe<Array<{ id: string; slug: string; title: string; pricePaise: number }>>(
          `SELECT id, slug, title, "pricePaise" FROM "Program"
           WHERE "isActive" = true AND "searchVector" @@ to_tsquery('english', $1)
           ORDER BY ts_rank("searchVector", to_tsquery('english', $1)) DESC
           LIMIT 10`,
          tsquery
        ),
        prisma.$queryRawUnsafe<Array<{ id: string; slug: string; title: string; pricePaise: number; imageUrl: string | null }>>(
          `SELECT id, slug, title, "pricePaise", "imageUrl" FROM "Course"
           WHERE "isActive" = true AND "searchVector" @@ to_tsquery('english', $1)
           ORDER BY ts_rank("searchVector", to_tsquery('english', $1)) DESC
           LIMIT 10`,
          tsquery
        ),
        prisma.$queryRawUnsafe<Array<{ id: string; slug: string; title: string; pricePaise: number; imageUrl: string | null }>>(
          `SELECT id, slug, title, "pricePaise", "imageUrl" FROM "Product"
           WHERE "isActive" = true AND "searchVector" @@ to_tsquery('english', $1)
           ORDER BY ts_rank("searchVector", to_tsquery('english', $1)) DESC
           LIMIT 10`,
          tsquery
        ),
        prisma.$queryRawUnsafe<Array<{ id: string; slug: string; title: string; category: string; duration: number; isPremium: boolean }>>(
          `SELECT id, slug, title, category, duration, "isPremium" FROM "AudioTrack"
           WHERE "searchVector" @@ to_tsquery('english', $1)
           ORDER BY ts_rank("searchVector", to_tsquery('english', $1)) DESC
           LIMIT 10`,
          tsquery
        ),
      ])

      return { services, healers, programs, courses, products, audio }
    })

    // Publication state is read afresh even when the other result groups are cached.
    const [results, blog] = await Promise.all([cachedResults, freshBlog])

    // Reshape healers to match previous API contract
    const shapedHealers = results.healers.map((h) => ({
      id: h.id,
      bio: h.bio,
      specializations: h.specializations,
      user: { name: h.userName, image: h.userImage },
    }))

    return NextResponse.json({
      services: results.services,
      healers: shapedHealers,
      programs: results.programs,
      courses: results.courses,
      products: results.products,
      blog,
      audio: results.audio,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[search][error]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
