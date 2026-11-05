import { NextResponse } from 'next/server'
import { createGatewayReceipt } from '@/lib/payments/receipts'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { trackEvent } from '@/lib/analytics/track-event'
import { getSessionId, getExperimentVariants } from '@/lib/analytics/session'
import { stampFirstTouch } from '@/lib/analytics/first-touch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const ItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().min(1).max(99),
})

const BodySchema = z.object({
  items: z.array(ItemSchema).min(1).max(50),
  source: z.string().optional(),
  chakra: z.string().optional(),
  intention: z.string().optional(),
  experimentVariant: z.string().optional(),
  shippingAddress: z.object({
    name: z.string().min(1),
    line1: z.string().min(1),
    line2: z.string().optional(),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    phone: z.string().optional(),
  }).optional(),
})

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    }

    const { items, shippingAddress, source, chakra, intention, experimentVariant } = parsed.data
    const productIds = items.map(i => i.productId)

    // Fetch products and validate
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, title: true, pricePaise: true, stockStatus: true },
    })

    const productMap = new Map(products.map(p => [p.id, p]))

    // Validate all products exist and are in stock
    for (const item of items) {
      const product = productMap.get(item.productId)
      if (!product) {
        return NextResponse.json({ error: `Product not found: ${item.productId}` }, { status: 404 })
      }
      if (product.stockStatus === 'OUT') {
        return NextResponse.json({ error: `Product out of stock: ${product.title}` }, { status: 400 })
      }
    }

    // Calculate total
    const totalPaise = items.reduce((sum, item) => {
      const product = productMap.get(item.productId)!
      return sum + product.pricePaise * item.quantity
    }, 0)

    if (totalPaise <= 0) {
      return NextResponse.json({ error: 'Order total must be positive' }, { status: 400 })
    }

    // Create order + items in a transaction
    const order = await prisma.order.create({
      data: {
        userId: session.user.id,
        status: 'pending_payment',
        totalPaise,
        shippingAddress: shippingAddress ?? undefined,
        source: source || null,
        chakra: chakra || null,
        intention: intention || null,
        experimentVariant: experimentVariant || null,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            pricePaise: productMap.get(item.productId)!.pricePaise * item.quantity,
          })),
        },
      },
    })

    // Create Razorpay order
    const { getRazorpayClient } = await import('@/lib/razorpay')
    const client = await getRazorpayClient()
    if (!client) {
      return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })
    }

    const metadata = { orderId: order.id }
    const razorpayOrder = await client.orders.create({
      amount: totalPaise,
      currency: 'INR',
      receipt: createGatewayReceipt('store'),
      notes: metadata,
    })

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId: session.user.id,
        type: 'STORE',
        statusEnum: 'PENDING',
        status: 'pending',
        amountPaise: totalPaise,
        currency: 'INR',
        gateway: 'razorpay',
        gatewayOrderId: razorpayOrder.id,
        metadata,
      },
    })

    console.log('[store][checkout][order_created]', { orderId: order.id, paymentId: payment.id, razorpayOrderId: razorpayOrder.id, totalPaise })

    // Server-side checkout_start event (trusted — after order + payment created)
    const [sessionId, variants] = await Promise.all([getSessionId(), getExperimentVariants()])
    const variantEntries = Object.entries(variants)
    trackEvent({
      type: 'checkout_start',
      userId: session.user.id,
      email: session.user.email ?? null,
      sessionId,
      experimentVariant: experimentVariant || (variantEntries.length > 0 ? `${variantEntries[0][0]}:${variantEntries[0][1]}` : null),
      source: source || null,
      chakra: chakra || null,
      metadata: { orderId: order.id, totalPaise, itemCount: items.length },
    }).catch(() => {})

    // Stamp first-touch attribution (no-op if already stamped)
    stampFirstTouch(
      session.user.id,
      source || null,
      experimentVariant || (variantEntries.length > 0 ? `${variantEntries[0][0]}:${variantEntries[0][1]}` : null),
    ).catch(() => {})

    return NextResponse.json({
      orderId: order.id,
      amountPaise: totalPaise,
      razorpayOrderId: razorpayOrder.id,
      key: process.env.RAZORPAY_KEY_ID,
    })
  } catch (err) {
    console.error('[store][checkout][error]', err)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
