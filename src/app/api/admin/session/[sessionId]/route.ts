import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/admin/session/[sessionId]
 *
 * Returns the full ordered event timeline for a given session.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { sessionId } = await params

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  try {
    const events = await prisma.funnelEvent.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        type: true,
        userId: true,
        experimentVariant: true,
        source: true,
        chakra: true,
        metadata: true,
        createdAt: true,
      },
    })

    if (events.length === 0) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const firstEvent = events[0]
    const lastEvent = events[events.length - 1]
    const durationMs =
      new Date(lastEvent.createdAt).getTime() - new Date(firstEvent.createdAt).getTime()

    // Determine which funnel stages were reached
    const stagesReached = [
      'quiz_start', 'quiz_complete', 'product_view',
      'add_to_cart', 'checkout_start', 'purchase',
    ].filter((stage) => events.some((e) => e.type === stage))

    // Did they drop off?
    const completed = stagesReached.includes('purchase')
    const lastStage = stagesReached[stagesReached.length - 1] ?? null

    return NextResponse.json({
      sessionId,
      eventCount: events.length,
      durationMs,
      stagesReached,
      completed,
      lastStage,
      userId: events.find((e) => e.userId)?.userId ?? null,
      source: firstEvent.source,
      chakra: events.find((e) => e.chakra)?.chakra ?? null,
      experimentVariant: firstEvent.experimentVariant,
      timeline: events.map((e) => ({
        id: e.id,
        type: e.type,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
    })
  } catch (err) {
    console.error('[session-replay] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
