import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BodySchema = z.object({
  healerId: z.string().cuid().optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ programId: string }> }) {
  try {
    const { programId } = await params
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = session.user.id
    let healerId: string | undefined
    if (req.headers.get('content-type')?.includes('application/json')) {
      const body = await req.json().catch(() => ({}))
      const parsed = BodySchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
      healerId = parsed.data.healerId
    }

    console.log('[programs][enroll][requested]', { programId, userId, healerId: healerId || null })

    const program = await prisma.program.findUnique({ where: { id: programId } })
    if (!program || !program.isActive) {
      return NextResponse.json({ error: 'Program not found or inactive' }, { status: 404 })
    }

    // Block duplicates (pending or active)
    const existing = await prisma.programEnrollment.findFirst({
      where: { userId, programId, status: { in: ['pending_payment','active'] } }
    })
    if (existing) {
      console.warn('[programs][enroll][blocked_duplicate]', { programId, userId, enrollmentId: existing.id })
      return NextResponse.json({ error: 'Enrollment already exists', enrollmentId: existing.id }, { status: 409 })
    }

    const enrollment = await prisma.programEnrollment.create({
      data: { userId, programId, healerId, status: 'pending_payment' }
    })

    // Call internal create-order logic via direct function (reuse generic order route pattern) - we construct payment ourselves
    // We do not trust client for amount; derive from program
    const amountPaise = program.pricePaise

    // Direct Razorpay order creation path replicating create-order implementation
    // Reuse generic flow by inserting payment after creating gateway order
    const { getRazorpayClient } = await import('@/lib/razorpay')
    const client = await getRazorpayClient()
    if (!client) {
      console.error('[programs][enroll][failed]', { reason: 'gateway_unavailable' })
      return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })
    }

    const metadata = { programId, enrollmentId: enrollment.id, healerId }
    const order = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `prog_${programId}_${Date.now()}`,
      notes: metadata,
    })

    const payment = await prisma.payment.create({
      data: {
        userId,
        type: 'PROGRAM',
        statusEnum: 'PENDING',
        status: 'pending',
        amountPaise,
        currency: 'INR',
        gateway: 'razorpay',
        gatewayOrderId: order.id,
        metadata,
      }
    })

    console.log('[programs][enroll][order_created]', { programId, enrollmentId: enrollment.id, paymentId: payment.id, orderId: order.id })

    return NextResponse.json({ orderId: order.id, amountPaise, enrollmentId: enrollment.id, key: process.env.RAZORPAY_KEY_ID })
  } catch (err) {
    console.error('[programs][enroll][failed]', err)
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 })
  }
}
