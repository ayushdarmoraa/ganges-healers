import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hasVipAccess } from '@/lib/memberships/access'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params

    const track = await prisma.audioTrack.findFirst({
      where: { OR: [{ id: slug }, { slug }] },
    })

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 })
    }

    // Premium access check
    if (track.isPremium) {
      const session = await auth()
      if (!session?.user?.id) {
        return NextResponse.json(
          { ...track, audioUrl: null, locked: true, reason: 'Sign in to access premium content' },
          { status: 200 }
        )
      }

      if (!await hasVipAccess(session.user.id)) {
        // Check for active program enrollment or course enrollment
        const [programEnrollment, courseEnrollment] = await Promise.all([
          prisma.programEnrollment.findFirst({
            where: { userId: session.user.id, status: 'active' },
            select: { id: true },
          }),
          prisma.courseEnrollment.findFirst({
            where: { userId: session.user.id, status: 'active' },
            select: { id: true },
          }),
        ])

        if (!programEnrollment && !courseEnrollment) {
          return NextResponse.json(
            { ...track, audioUrl: null, locked: true, reason: 'Premium content requires VIP membership, or an active program/course enrollment' },
            { status: 200 }
          )
        }
      }
    }

    return NextResponse.json({ ...track, locked: false })
  } catch (err) {
    console.error('[audio][detail][error]', err)
    return NextResponse.json({ error: 'Failed to fetch track' }, { status: 500 })
  }
}
