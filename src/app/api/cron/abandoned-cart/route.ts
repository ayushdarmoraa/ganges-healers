import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendWhatsAppAbandonedCart, sendWhatsAppFinalReminder } from '@/lib/whatsapp/interakt'
import { emailService } from '@/lib/email/email.service'

interface CartItemJson {
  productId: string
  slug: string
  title: string
  pricePaise: number
  imageUrl: string | null
  quantity: number
}

const ONE_HOUR = 60 * 60 * 1000
const TWENTY_FOUR_HOURS = 24 * ONE_HOUR
const FORTY_EIGHT_HOURS = 48 * ONE_HOUR

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET?.trim() || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = Date.now()
    const stats = { whatsapp: 0, email: 0, final: 0, recovered: 0, failed: 0 }

    // Find all non-recovered carts
    const staleCarts = await prisma.abandonedCart.findMany({
      where: {
        recoveredAt: null,
        updatedAt: { lte: new Date(now - ONE_HOUR) },
      },
      take: 50,
    })

    for (const cart of staleCarts) {
      const ageMs = now - cart.updatedAt.getTime()

      // Check if user has completed an order since the cart was created
      if (cart.userId) {
        const recentOrder = await prisma.order.findFirst({
          where: {
            userId: cart.userId,
            status: { not: 'pending_payment' },
            createdAt: { gte: cart.createdAt },
          },
        })
        if (recentOrder) {
          await prisma.abandonedCart.update({
            where: { id: cart.id },
            data: { recoveredAt: new Date() },
          })
          stats.recovered++
          continue
        }
      }

      const items = cart.items as unknown as CartItemJson[]
      const primaryItem = Array.isArray(items) ? items[0] : null
      if (!primaryItem) continue

      // TIER 1: WhatsApp at 1 hour (if phone available, not yet sent)
      if (!cart.whatsappSentAt && cart.phone && ageMs >= ONE_HOUR) {
        const result = await sendWhatsAppAbandonedCart({
          phone: cart.phone,
          productTitle: primaryItem.title,
          productSlug: primaryItem.slug,
          chakra: cart.chakra,
          intention: cart.intention,
        })
        if (result.success) {
          await prisma.abandonedCart.update({
            where: { id: cart.id },
            data: { whatsappSentAt: new Date() },
          })
          stats.whatsapp++
        } else {
          stats.failed++
        }
        continue // don't send multiple in one run
      }

      // TIER 2: Email at 24 hours (if email available, not yet sent)
      if (!cart.emailSentAt && cart.email && ageMs >= TWENTY_FOUR_HOURS) {
        const result = await emailService.sendAbandonedCartRecovery({
          to: cart.email,
          productTitle: primaryItem.title,
          productSlug: primaryItem.slug,
          chakra: cart.chakra,
          intention: cart.intention,
        })
        if (result.success) {
          await prisma.abandonedCart.update({
            where: { id: cart.id },
            data: { emailSentAt: new Date() },
          })
          stats.email++
        } else {
          stats.failed++
        }
        continue
      }

      // TIER 3: Final WhatsApp reminder at 48 hours (if phone available, not yet sent)
      if (!cart.finalReminderSentAt && cart.phone && ageMs >= FORTY_EIGHT_HOURS) {
        const result = await sendWhatsAppFinalReminder({
          phone: cart.phone,
          productTitle: primaryItem.title,
          productSlug: primaryItem.slug,
          chakra: cart.chakra,
          intention: cart.intention,
        })
        if (result.success) {
          await prisma.abandonedCart.update({
            where: { id: cart.id },
            data: { finalReminderSentAt: new Date() },
          })
          stats.final++
        } else {
          stats.failed++
        }
      }
    }

    console.log('[abandoned-cart] Cron complete:', stats)
    return NextResponse.json({ processed: staleCarts.length, ...stats })
  } catch (error) {
    console.error('[abandoned-cart] Cron error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
