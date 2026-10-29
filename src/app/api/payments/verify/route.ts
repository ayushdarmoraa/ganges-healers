import { isTestMode } from '@/lib/test-mode'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import crypto from 'crypto'
import { auth } from '@/lib/auth'
import { generateInvoiceForPayment } from '@/lib/invoices/generate'
import { logActivity } from '@/lib/activity-log'
import { trackEvent } from '@/lib/analytics/track-event'
import { getSessionId, getExperimentVariants } from '@/lib/analytics/session'
import { PaymentResourceError } from '@/lib/payments/resource'
import { finalizePayment } from '@/lib/payments/finalize'
import { runSideEffect } from '@/lib/runSideEffect'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const VerifySchema = z.object({
  orderId: z.string().min(5),
  paymentId: z.string().min(5),
  signature: z.string().min(5),
})

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = VerifySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    const { orderId, paymentId, signature } = parsed.data

    const secret = process.env.RAZORPAY_KEY_SECRET
    if (!secret) return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex')

    const validSignature = /^[a-f0-9]{64}$/i.test(signature)
      && crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
    if (!validSignature) {
      if (isTestMode()) {
        console.log('[payments][verify][test-bypass]', { orderId, paymentId })
      } else {
        console.warn('[payments][verify][hmac-mismatch]', { orderId, paymentId })
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
      }
    }

    const result = await finalizePayment({ orderId, paymentId, signature, userId: session.user.id })
    const { payment: updated, activation, storeActivation, courseActivation } = result
    // Invoices are retryable and must not change the result of a committed purchase.
    await runSideEffect(generateInvoiceForPayment({ paymentId: updated.id, force: false })
      .catch(() => console.warn('[payments][verify][invoice_failed]', { paymentId: updated.id })))
    if (result.idempotent) {
      console.log('[payments][verify][idempotent-success]', { paymentId: updated.id })
      return NextResponse.json({ verified: true, idempotent: true })
    }
    console.log('[payments][verify][success]', { paymentId: updated.id, gatewayPaymentId: paymentId, activation, storeActivation, courseActivation })
    await runSideEffect(logActivity({ userId: session.user.id, action: 'payment_verified', entityType: 'payment', entityId: updated.id, metadata: { type: updated.type, amountPaise: updated.amountPaise } }))

    // Server-side purchase event (trusted — only fires after signature verification + payment update)
    await runSideEffect((async () => {
      try {
        const [sessionId, variants] = await Promise.all([getSessionId(), getExperimentVariants()])
        const variantEntries = Object.entries(variants)
        await trackEvent({
          type: 'purchase',
          userId: session.user.id,
          email: session.user.email ?? null,
          sessionId,
          experimentVariant: variantEntries.length > 0 ? `${variantEntries[0][0]}:${variantEntries[0][1]}` : null,
          metadata: { paymentId: updated.id, amountPaise: updated.amountPaise, type: updated.type },
          allowDuplicate: false,
        })
      } catch {
        console.warn('[payments][verify][analytics_failed]', { paymentId: updated.id })
      }
    })())

    return NextResponse.json({ verified: true, payment: { id: updated.id }, activation, storeActivation, courseActivation })
  } catch (err) {
    if (err instanceof PaymentResourceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[payments][verify][error]', err)
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
