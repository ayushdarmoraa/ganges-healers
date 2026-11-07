import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { lockTransaction } from '@/lib/db/locks'
import { lockPaymentResource } from '@/lib/payments/resource'
import { createGatewayReceipt } from '@/lib/payments/receipts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = session.user.id
    const catalogCourse = await prisma.course.findFirst({ where: { OR: [{ id: slug }, { slug }], isActive: true } })
    if (!catalogCourse) return NextResponse.json({ error: 'Course not found or inactive' }, { status: 404 })

    return await prisma.$transaction(async tx => {
      // Catalog deletion, archiving, curriculum edits, and quote allocation share this lock.
      await lockTransaction(tx, 'course', `catalog:${catalogCourse.id}`)
      const course = await tx.course.findFirst({ where: { id: catalogCourse.id, isActive: true } })
      if (!course) return NextResponse.json({ error: 'Course not found or inactive' }, { status: 404 })
      // A retry must see the preceding enrollment and order before creating either again.
      await lockTransaction(tx, 'course', `${userId}:${course.id}`)
      let enrollment = await tx.courseEnrollment.findUnique({ where: { userId_courseId: { userId, courseId: course.id } } })
      if (enrollment && ['active', 'completed'].includes(enrollment.status)) {
        return NextResponse.json({ error: 'Already enrolled', enrollmentId: enrollment.id, enrolled: true }, { status: 409 })
      }
      if (enrollment && enrollment.status !== 'pending_payment') {
        return NextResponse.json({ error: 'This enrollment cannot be checked out.', enrollmentId: enrollment.id }, { status: 409 })
      }
      // Share the purchase lock with generic checkout and fulfillment writers as well as this allocation route.
      if (enrollment) await lockPaymentResource(tx, 'COURSE', undefined, { enrollmentId: enrollment.id })
      const payment = enrollment ? await tx.payment.findFirst({
        where: { userId, type: 'COURSE', metadata: { path: ['enrollmentId'], equals: enrollment.id } },
        orderBy: { createdAt: 'desc' },
      }) : null
      const amountPaise = enrollment?.pricePaise ?? payment?.amountPaise ?? course.pricePaise
      if (!Number.isSafeInteger(amountPaise) || amountPaise < 0) {
        return NextResponse.json({ error: 'Invalid course price' }, { status: 400 })
      }

      if (payment) {
        const metadata = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata) ? payment.metadata : {}
        const pending = payment.statusEnum === 'PENDING' || (!payment.statusEnum && payment.status === 'pending')
        if (!pending || payment.gateway !== 'razorpay' || !payment.gatewayOrderId ||
            payment.amountPaise !== amountPaise || payment.currency !== 'INR' ||
            metadata.enrollmentId !== enrollment!.id || metadata.courseId !== course.id || amountPaise === 0) {
          return NextResponse.json({ error: 'This checkout needs review before another payment. Please contact support.', enrollmentId: enrollment!.id }, { status: 409 })
        }
      }

      // Zero-price quotes grant access directly, with no payment record or gateway dependency.
      if (amountPaise === 0) {
        enrollment = enrollment
          ? await tx.courseEnrollment.update({ where: { id: enrollment.id }, data: { status: 'active', pricePaise: 0 } })
          : await tx.courseEnrollment.create({ data: { userId, courseId: course.id, pricePaise: 0, status: 'active' } })
        console.log('[courses][enroll][free_activated]', { courseId: course.id, enrollmentId: enrollment.id })
        return NextResponse.json({ enrolled: true, enrollmentId: enrollment.id, amountPaise: 0 })
      }

      const { getRazorpayClient } = await import('@/lib/razorpay')
      const client = await getRazorpayClient()
      if (!client) return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })
      if (payment) {
        if (enrollment!.pricePaise === null) await tx.courseEnrollment.update({ where: { id: enrollment!.id }, data: { pricePaise: amountPaise } })
        return NextResponse.json({ orderId: payment.gatewayOrderId, amountPaise, enrollmentId: enrollment!.id, key: process.env.RAZORPAY_KEY_ID, resumed: true })
      }
      if (!enrollment) {
        enrollment = await tx.courseEnrollment.create({ data: { userId, courseId: course.id, pricePaise: amountPaise, status: 'pending_payment' } })
        await lockPaymentResource(tx, 'COURSE', undefined, { enrollmentId: enrollment.id })
      }
      else if (enrollment.pricePaise === null) enrollment = await tx.courseEnrollment.update({ where: { id: enrollment.id }, data: { pricePaise: amountPaise } })
      const metadata = { courseId: course.id, enrollmentId: enrollment.id }
      const order: { id: string } = await client.orders.create({
        amount: amountPaise, currency: 'INR', receipt: createGatewayReceipt('course'), notes: metadata,
      })
      if (typeof order.id !== 'string' || !order.id) throw new Error('Gateway order was not confirmed')
      await tx.payment.create({ data: {
        userId, type: 'COURSE', statusEnum: 'PENDING', status: 'pending', amountPaise,
        currency: 'INR', gateway: 'razorpay', gatewayOrderId: order.id, metadata,
      } })
      console.log('[courses][enroll][order_created]', { courseId: course.id, enrollmentId: enrollment.id, orderId: order.id })
      return NextResponse.json({ orderId: order.id, amountPaise, enrollmentId: enrollment.id, key: process.env.RAZORPAY_KEY_ID })
    }, { timeout: 20_000 })
  } catch {
    console.error('[courses][enroll][failed]')
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 })
  }
}
