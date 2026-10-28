import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { cached } from '@/lib/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    const cacheKey = `audio:list:${category || 'all'}`
    const data = await cached(cacheKey, async () => {
      const where = category ? { category } : {}

      const [tracks, categoriesRaw] = await Promise.all([
        prisma.audioTrack.findMany({
          where,
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            category: true,
            audioUrl: true,
            duration: true,
            isPremium: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.audioTrack.findMany({
          select: { category: true },
          distinct: ['category'],
          orderBy: { category: 'asc' },
        }),
      ])

      return {
        tracks,
        categories: categoriesRaw.map((c) => c.category),
      }
    })

    // Redact after the cache lookup so warm entries are subject to the same policy.
    // Premium playback URLs are available only through the access-checked detail API.
    return NextResponse.json({
      ...data,
      tracks: data.tracks.map(track => ({ ...track, audioUrl: track.isPremium ? null : track.audioUrl })),
    })
  } catch (err) {
    console.error('[audio][list][error]', err)
    return NextResponse.json({ error: 'Failed to fetch audio tracks' }, { status: 500 })
  }
}
