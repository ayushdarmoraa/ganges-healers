import { NextResponse } from 'next/server'
import { razorpay } from '@/lib/razorpay'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function POST(req: Request) {
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

  const order = await razorpay.orders.create({
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
