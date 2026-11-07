import { isTestMode } from '@/lib/test-mode'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// TEST_MODE only — guarded endpoint for E2E determinism
export async function GET(_request: Request) {
  void _request
  if (!isTestMode()) {
    return NextResponse.json({ success: false, error: 'not available' }, { status: 404 })
  }

  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
    }

    const userId = session.user.id as string
    const bookings = await prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 1,
      include: {
        healer: {
          include: {
            user: { select: { name: true, image: true } }
          }
        },
        service: { select: { name: true, category: true, slug: true } },
        payment: { select: { status: true, amountPaise: true } }
      }
    })

    return NextResponse.json({ success: true, data: bookings }, { status: 200 })
  } catch (err) {
    console.error('GET /api/test/last-booking error:', err)
    return NextResponse.json({ success: false, error: 'internal' }, { status: 500 })
  }
}
