import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const BodySchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().min(1),
    pricePaise: z.number().int(),
    imageUrl: z.string().nullable(),
    quantity: z.number().int().min(1),
  })).min(1),
  source: z.string().optional(),
  chakra: z.string().optional(),
  intention: z.string().optional(),
})

/**
 * POST /api/store/cart-activity
 * Client pings this when the cart changes. Upserts an AbandonedCart record
 * so the cron can check for stale carts and send recovery messages.
 */
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ ok: true }) // silently ignore anonymous
    }

    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

    const { items, source, chakra, intention } = parsed.data
    const userId = session.user.id

    // Find user's phone and email for WhatsApp recovery
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, phone: true },
    })

    // Upsert: one active cart per user (find existing non-recovered cart)
    const existing = await prisma.abandonedCart.findFirst({
      where: { userId, recoveredAt: null },
      orderBy: { createdAt: 'desc' },
    })

    if (existing) {
      await prisma.abandonedCart.update({
        where: { id: existing.id },
        data: {
          items: items as unknown as Parameters<typeof prisma.abandonedCart.update>[0]['data']['items'],
          source: source || existing.source,
          chakra: chakra || existing.chakra,
          intention: intention || existing.intention,
          phone: user?.phone || existing.phone,
          email: user?.email || existing.email,
        },
      })
    } else {
      await prisma.abandonedCart.create({
        data: {
          userId,
          email: user?.email || null,
          phone: user?.phone || null,
          items: items as unknown as Parameters<typeof prisma.abandonedCart.create>[0]['data']['items'],
          source: source || null,
          chakra: chakra || null,
          intention: intention || null,
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[cart-activity] Error:', error)
    return NextResponse.json({ ok: true }) // don't break UX on tracking failure
  }
}

/**
 * DELETE /api/store/cart-activity
 * Called after successful checkout — marks the cart as recovered.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function DELETE(_req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ ok: true })

    // Mark all non-recovered carts for this user as recovered
    await prisma.abandonedCart.updateMany({
      where: { userId: session.user.id, recoveredAt: null },
      data: { recoveredAt: new Date() },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[cart-activity] Delete error:', error)
    return NextResponse.json({ ok: true })
  }
}
