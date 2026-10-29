import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id

    const course = await prisma.course.findFirst({
      where: { OR: [{ id: slug }, { slug }], isActive: true },
    })
    if (!course) {
      return NextResponse.json({ error: 'Course not found or inactive' }, { status: 404 })
    }

    // Block duplicate enrollments (pending or active)
    const existing = await prisma.courseEnrollment.findFirst({
      where: { userId, courseId: course.id, status: { in: ['pending_payment', 'active'] } },
    })
    if (existing) {
      return NextResponse.json({ error: 'Already enrolled', enrollmentId: existing.id }, { status: 409 })
    }

    const enrollment = await prisma.courseEnrollment.create({
      data: { userId, courseId: course.id, pricePaise: course.pricePaise, status: 'pending_payment' },
    })

    const { getRazorpayClient } = await import('@/lib/razorpay')
    const client = await getRazorpayClient()
    if (!client) {
      return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })
    }

    const amountPaise = course.pricePaise
    const metadata = { courseId: course.id, enrollmentId: enrollment.id }

    const order = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `course_${course.id}_${Date.now()}`,
      notes: metadata,
    })

    await prisma.payment.create({
      data: {
        userId,
        type: 'COURSE',
        statusEnum: 'PENDING',
        status: 'pending',
        amountPaise,
        currency: 'INR',
        gateway: 'razorpay',
        gatewayOrderId: order.id,
        metadata,
      },
    })

    console.log('[courses][enroll][order_created]', { courseId: course.id, enrollmentId: enrollment.id, orderId: order.id })

    return NextResponse.json({
      orderId: order.id,
      amountPaise,
      enrollmentId: enrollment.id,
      key: process.env.RAZORPAY_KEY_ID,
    })
  } catch (err) {
    console.error('[courses][enroll][failed]', err)
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 })
  }
}
