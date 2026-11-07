import { NextResponse } from 'next/server'
import { createPaymentOrder } from '@/lib/payments/create-order'
import { PaymentResourceError } from '@/lib/payments/resource'
import { prepareStoreOrder, storeCheckoutSchema } from '@/lib/store/checkout'
import { auth } from '@/lib/auth'
import { trackEvent } from '@/lib/analytics/track-event'
import { getSessionId, getExperimentVariants } from '@/lib/analytics/session'
import { stampFirstTouch } from '@/lib/analytics/first-touch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: Request) {
  let savedOrderId: string | undefined
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = storeCheckoutSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    }

    const { items, source, chakra, experimentVariant } = parsed.data
    const { order, resumed } = await prepareStoreOrder(session.user.id, parsed.data)
    savedOrderId = order.id
    const payment = await createPaymentOrder({ userId: session.user.id, type: 'STORE', metadata: { orderId: order.id }, receiptPrefix: 'store' })
    const totalPaise = payment.amountPaise
    console.log('[store][checkout][order_created]', { orderId: order.id, paymentId: payment.paymentId, razorpayOrderId: payment.orderId, totalPaise, resumed })

    // Server-side checkout_start event (trusted — after order + payment created)
    try {
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
    } catch (error) {
      console.warn('[store][checkout][analytics_failed]', { orderId: order.id, error: error instanceof Error ? error.name : 'UnknownError' })
    }

    return NextResponse.json({
      orderId: order.id,
      amountPaise: totalPaise,
      razorpayOrderId: payment.orderId,
      key: payment.key,
      resumed,
    })
  } catch (err) {
    if (err instanceof PaymentResourceError) {
      return NextResponse.json({ error: err.message, ...(savedOrderId ? { orderId: savedOrderId } : {}) }, { status: err.status })
    }
    console.error('[store][checkout][error]', err)
    return NextResponse.json({ error: 'Checkout failed', ...(savedOrderId ? { orderId: savedOrderId } : {}) }, { status: 500 })
  }
}
