import { NextResponse } from 'next/server'
import { getRazorpayClient } from '@/lib/razorpay'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// DEPRECATED: This route will be removed after 2025-10-15.
// Use /api/payments/create-order instead. Controlled by ENABLE_LEGACY_RAZORPAY_ORDER.
export async function POST(req: Request) {
  if (!process.env.ENABLE_LEGACY_RAZORPAY_ORDER && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Legacy route disabled. Use /api/payments/create-order.' }, { status: 410 })
  }
  console.warn('[payments][legacy-order][deprecated] Invocation detected')
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { bookingId } = await req.json()
  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId required' }, { status: 400 })
  }

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { service: true },
  })

  if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (booking.userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (booking.status !== 'PENDING') return NextResponse.json({ error: 'Invalid booking state' }, { status: 400 })

  const amountPaise = booking.pricePaise || Math.round(booking.service.price * 100)

  const client = await getRazorpayClient()
  if (!client) {
    const msg = process.env.NODE_ENV === 'development'
      ? 'Razorpay keys missing; set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET'
      : 'Payment service unavailable'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const order = await client.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: `bk_${booking.id}`,
    notes: { bookingId: booking.id, serviceId: booking.serviceId },
  })

  await prisma.payment.upsert({
    where: { bookingId: booking.id },
    update: { gateway: 'razorpay', orderId: order.id, status: 'pending', amountPaise },
    create: { bookingId: booking.id, gateway: 'razorpay', orderId: order.id, status: 'pending', amountPaise },
  })

  return NextResponse.json({
    orderId: order.id,
    amount: amountPaise,
    currency: 'INR',
    key_id: process.env.RAZORPAY_KEY_ID,
  })
}
