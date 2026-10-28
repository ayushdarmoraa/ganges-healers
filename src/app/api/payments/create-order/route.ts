import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRazorpayClient } from '@/lib/razorpay'
import { PaymentResourceError, resolvePaymentResource } from '@/lib/payments/resource'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BodySchema = z.object({
  amountPaise: z.number().int().positive().optional(),
  bookingId: z.string().cuid().optional(),
  type: z.enum(['SESSION','PROGRAM','MEMBERSHIP','STORE','COURSE']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
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

    const resource = await resolvePaymentResource({
      userId: session.user.id, type: bookingId ? 'SESSION' : type!, bookingId, metadata,
    })
    if (rawAmount !== undefined && rawAmount !== resource.amountPaise) {
      return NextResponse.json({ error: 'Amount does not match resource price' }, { status: 400 })
    }

    const client = await getRazorpayClient()
    if (!client) return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })

    const ensuredAmount = resource.amountPaise
    const order = await client.orders.create({
      amount: ensuredAmount,
      currency: 'INR',
      receipt: `pay_${Date.now()}`,
      notes: resource.metadata,
    })

    // Persist / upsert payment row
    let paymentRecord
    if (bookingId) {
      paymentRecord = await prisma.payment.upsert({
        where: { bookingId },
        update: {
          type: resource.type,
          userId: session.user.id,
          statusEnum: 'PENDING',
          status: 'pending',
          amountPaise: ensuredAmount,
          currency: 'INR',
          gateway: 'razorpay',
          gatewayOrderId: order.id,
          metadata: resource.metadata,
        },
        create: {
          bookingId,
          userId: session.user.id,
          type: resource.type,
          statusEnum: 'PENDING',
          status: 'pending',
          amountPaise: ensuredAmount,
          currency: 'INR',
          gateway: 'razorpay',
          gatewayOrderId: order.id,
          metadata: resource.metadata,
        }
      })
    } else {
      paymentRecord = await prisma.payment.create({
        data: {
          userId: session.user.id,
          type: resource.type,
          statusEnum: 'PENDING',
          status: 'pending',
          amountPaise: ensuredAmount,
          currency: 'INR',
          gateway: 'razorpay',
          gatewayOrderId: order.id,
          metadata: resource.metadata,
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
    if (err instanceof PaymentResourceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[payments][create-order][error]', err)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
