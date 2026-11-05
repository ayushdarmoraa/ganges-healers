import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { lockTransaction } from '@/lib/db/locks'
import { lockPaymentResource, PaymentResourceError } from '@/lib/payments/resource'
import { createPaymentOrder } from '@/lib/payments/create-order'
import { buildProgramSchedule } from '@/lib/programs/schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
const BodySchema = z.object({ healerId: z.string().cuid().optional() })

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = session.user.id
    let healerId: string | undefined
    if (req.headers.get('content-type')?.includes('application/json')) {
      const parsed = BodySchema.safeParse(await req.json().catch(() => ({})))
      if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
      healerId = parsed.data.healerId
    }
    const catalogProgram = await prisma.program.findFirst({ where: { OR: [{ id: slug }, { slug }] } })
    if (!catalogProgram || !catalogProgram.isActive) return NextResponse.json({ error: 'Program not found or inactive' }, { status: 404 })
    console.log('[programs][enroll][requested]', { programKey: slug, programId: catalogProgram.id, userId, healerId: healerId || null })

    const reservation = await prisma.$transaction(async tx => {
      await lockTransaction(tx, 'program', `catalog:${catalogProgram.id}`)
      const program = await tx.program.findUnique({ where: { id: catalogProgram.id } })
      if (!program?.isActive) return { error: 'Program not found or inactive' } as const
      await lockTransaction(tx, 'program', `${userId}:${program.id}`)
      const existing = await tx.programEnrollment.findMany({
        where: { userId, programId: program.id, status: { in: ['pending_payment', 'active', 'paused'] } },
        orderBy: { createdAt: 'desc' }, take: 2,
      })
      const active = existing.find(row => row.status === 'active' || row.status === 'paused')
      if (active) return { error: 'Enrollment already exists', enrollmentId: active.id, enrolled: true } as const
      if (existing.length > 1) return { error: 'Multiple pending enrollments need review. Please contact support.' } as const
      let enrollment = existing[0]
      if (enrollment && healerId && enrollment.healerId !== healerId) {
        return { error: 'Continue the existing checkout with its selected healer before changing it.', enrollmentId: enrollment.id } as const
      }
      if (enrollment) {
        await lockPaymentResource(tx, 'PROGRAM', undefined, { enrollmentId: enrollment.id })
        const payment = await tx.payment.findFirst({ where: { userId, type: 'PROGRAM', metadata: { path: ['enrollmentId'], equals: enrollment.id } }, orderBy: { createdAt: 'desc' } })
        const amount = enrollment.pricePaise ?? payment?.amountPaise ?? program.pricePaise
        if (payment) {
          const metadata = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata) ? payment.metadata : {}
          const pending = payment.statusEnum === 'PENDING' || (!payment.statusEnum && payment.status === 'pending')
          if (!pending || payment.gateway !== 'razorpay' || !payment.gatewayOrderId || payment.currency !== 'INR' || payment.amountPaise !== amount || metadata.programId !== program.id || metadata.enrollmentId !== enrollment.id || (metadata.healerId ?? null) !== enrollment.healerId) {
            return { error: 'This checkout needs review before another payment. Please contact support.', enrollmentId: enrollment.id } as const
          }
        }
        if (!Number.isSafeInteger(amount) || amount <= 0) return { error: 'Program has no payable price.' } as const
        if (enrollment.pricePaise === null) enrollment = await tx.programEnrollment.update({ where: { id: enrollment.id }, data: { pricePaise: amount } })
        return { enrollment, resumed: true } as const
      }
      if (!Number.isSafeInteger(program.pricePaise) || program.pricePaise <= 0) return { error: 'Program has no payable price.' } as const
      enrollment = await tx.programEnrollment.create({ data: { userId, programId: program.id, pricePaise: program.pricePaise, healerId, status: 'pending_payment', schedule: buildProgramSchedule(program.totalSessions, program.sessionsPerWeek, program.durationMinutes, new Date()).sessions } })
      return { enrollment, resumed: false } as const
    }, { maxWait: 10000, timeout: 10000 })
    if ('error' in reservation) {
      console.warn('[programs][enroll][blocked_duplicate]', { programId: catalogProgram.id, userId })
      return NextResponse.json(reservation, { status: 409 })
    }
    const { enrollment } = reservation
    const order = await createPaymentOrder({ userId, type: 'PROGRAM', metadata: { programId: catalogProgram.id, enrollmentId: enrollment.id, healerId: enrollment.healerId }, receiptPrefix: 'prog' })
    console.log('[programs][enroll][order_created]', { programId: catalogProgram.id, enrollmentId: enrollment.id, paymentId: order.paymentId, orderId: order.orderId })
    return NextResponse.json({ orderId: order.orderId, amountPaise: order.amountPaise, enrollmentId: enrollment.id, key: order.key, ...(reservation.resumed ? { resumed: true } : {}) })
  } catch (error) {
    if (error instanceof PaymentResourceError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[programs][enroll][failed]')
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 })
  }
}
