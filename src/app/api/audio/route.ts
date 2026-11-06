import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    // Publication and premium changes must be visible across all serverless instances.
    // An instance-local cache cannot safely retain a withdrawn track or an old free URL.
    const where = { isPublished: true, ...(category ? { category } : {}) }

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
        where: { isPublished: true },
        select: { category: true },
        distinct: ['category'],
        orderBy: { category: 'asc' },
      }),
    ])

    const data = {
      tracks,
      categories: categoriesRaw.map((c) => c.category),
    }

    // Premium playback URLs are available only through the access-checked detail API.
    return NextResponse.json({
      ...data,
      tracks: data.tracks.map(track => ({ ...track, audioUrl: track.isPremium ? null : track.audioUrl })),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    console.error('[audio][list][error]', err)
    return NextResponse.json({ error: 'Failed to fetch audio tracks' }, { status: 500 })
  }
}
