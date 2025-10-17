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

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
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

    // Resolve program by id OR slug for flexibility
    const program = await prisma.program.findFirst({
      where: { OR: [{ id: slug }, { slug }] },
    })

    if (!program || !program.isActive) {
      return NextResponse.json({ error: 'Program not found or inactive' }, { status: 404 })
    }

    console.log('[programs][enroll][requested]', { programKey: slug, programId: program.id, userId, healerId: healerId || null })

    // Block duplicates (pending or active)
    const existing = await prisma.programEnrollment.findFirst({
      where: { userId, programId: program.id, status: { in: ['pending_payment','active'] } }
    })
    if (existing) {
      console.warn('[programs][enroll][blocked_duplicate]', { programId: program.id, userId, enrollmentId: existing.id })
      return NextResponse.json({ error: 'Enrollment already exists', enrollmentId: existing.id }, { status: 409 })
    }

    const enrollment = await prisma.programEnrollment.create({
      data: { userId, programId: program.id, healerId, status: 'pending_payment' }
    })

    const { getRazorpayClient } = await import('@/lib/razorpay')
    const client = await getRazorpayClient()
    if (!client) {
      console.error('[programs][enroll][failed]', { reason: 'gateway_unavailable' })
      return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })
    }

    const amountPaise = program.pricePaise
    const metadata = { programId: program.id, enrollmentId: enrollment.id, healerId }
    const order = await client.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `prog_${program.id}_${Date.now()}`,
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

    console.log('[programs][enroll][order_created]', { programId: program.id, enrollmentId: enrollment.id, paymentId: payment.id, orderId: order.id })

    return NextResponse.json({ orderId: order.id, amountPaise, enrollmentId: enrollment.id, key: process.env.RAZORPAY_KEY_ID })
  } catch (err) {
    console.error('[programs][enroll][failed]', err)
    return NextResponse.json({ error: 'Enrollment failed' }, { status: 500 })
  }
}
// Note: unified under [slug] to avoid dynamic segment name conflicts across routes.
