import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRazorpayClient } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BodySchema = z.object({
  amountPaise: z.number().int().positive().optional(),
  bookingId: z.string().cuid().optional(),
  type: z.enum(['SESSION','PROGRAM','MEMBERSHIP','STORE','COURSE']).optional(),
  metadata: z.any().optional(),
})

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    }
  const { amountPaise: rawAmount, bookingId, type, metadata } = parsed.data

    // Enforce mutual exclusivity: either bookingId OR type (generic). Not both.
    if ((bookingId && type) || (!bookingId && !type)) {
      return NextResponse.json({ error: 'Provide either bookingId OR type (generic payment), exclusively.' }, { status: 400 })
    }

  let amountPaiseValue: number | undefined = rawAmount
    let booking: any = null // eslint-disable-line @typescript-eslint/no-explicit-any

    if (bookingId) {
      booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { service: true } })
      if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
      if (booking.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  amountPaiseValue = booking.pricePaise || Math.round(booking.service.price * 100)
    } else {
      // generic path requires amountPaise
      if (!rawAmount || rawAmount <= 0) {
        return NextResponse.json({ error: 'amountPaise must be a positive integer for generic payments' }, { status: 400 })
      }
  amountPaiseValue = rawAmount
    }

    const client = await getRazorpayClient()
    if (!client) return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })

    const ensuredAmount = amountPaiseValue as number
    const order = await client.orders.create({
      amount: ensuredAmount,
      currency: 'INR',
      receipt: `pay_${Date.now()}`,
      notes: metadata || {},
    })

    // Persist / upsert payment row
    let paymentRecord
    if (bookingId) {
      paymentRecord = await prisma.payment.upsert({
        where: { bookingId },
        update: {
          type: type ?? 'SESSION',
          statusEnum: 'PENDING',
          status: 'pending',
          amountPaise: ensuredAmount,
          currency: 'INR',
          gateway: 'razorpay',
          gatewayOrderId: order.id,
          metadata,
        },
        create: {
          bookingId,
            userId: session.user.id,
          type: type ?? 'SESSION',
          statusEnum: 'PENDING',
          status: 'pending',
          amountPaise: ensuredAmount,
          currency: 'INR',
          gateway: 'razorpay',
          gatewayOrderId: order.id,
          metadata,
        }
      })
    } else {
      paymentRecord = await prisma.payment.create({
        data: {
          userId: session.user.id,
          type: type!,
          statusEnum: 'PENDING',
          status: 'pending',
          amountPaise: ensuredAmount,
          currency: 'INR',
          gateway: 'razorpay',
          gatewayOrderId: order.id,
          metadata,
        }
      })
    }

    console.log('[payments][create-order][success]', { paymentId: paymentRecord.id, bookingId: bookingId || null, type: paymentRecord.type, amountPaise: ensuredAmount, orderId: order.id })
    return NextResponse.json({
      orderId: order.id,
      amountPaise: ensuredAmount,
      currency: 'INR',
      key: process.env.RAZORPAY_KEY_ID,
      paymentId: paymentRecord.id,
    })
  } catch (err) {
    console.error('[payments][create-order][error]', err)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
