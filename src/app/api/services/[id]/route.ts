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
      include: {
        bookings: {
          where: { status: 'COMPLETED' },
          include: {
            healer: {
              include: {
                user: {
                  select: { name: true, image: true }
                }
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

        // Extract unique healers from completed bookings
    type HealerData = { 
      id: string; 
      rating: number;
      user: { name: string | null; image: string | null };
    };
    const healers: HealerData[] = service.bookings
      .map((b: { healer: HealerData }) => b.healer)
      .filter((healer: HealerData, index: number, self: HealerData[]) => 
        index === self.findIndex((h: HealerData) => h.id === healer.id)
      );
    const averageRating = healers.length > 0
      ? healers.reduce((acc: number, h: HealerData) => acc + h.rating, 0) / healers.length
      : 0

    return NextResponse.json({
      success: true,
      data: {
        ...service,
        healers,
        averageRating: Math.round(averageRating * 10) / 10,
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