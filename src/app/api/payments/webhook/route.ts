// src/app/api/payments/webhook/route.ts
// Copilot prompt: Review this webhook handler for Razorpay. Ensure it reads the raw request body, verifies HMAC with RAZORPAY_WEBHOOK_SECRET, returns 401 on mismatch and { ok: true } on success, and logs [webhook] verified with event + IDs. Do not add DB side-effects. Keep response shape stable.
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { applyWebhookSideEffects } from '@/lib/payments/webhook-apply'
// import { prisma } from '@/lib/prisma'  // uncomment later when you wire DB updates

// NOTE: App Router can read the raw body via req.text()
export async function POST(req: Request) {
  const signature = req.headers.get('x-razorpay-signature') || '';
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  if (!secret) {
    console.error('[webhook] missing RAZORPAY_WEBHOOK_SECRET');
    return NextResponse.json({ ok: false, error: 'secret-missing' }, { status: 500 });
  }

  const bodyText = await req.text();

  // Verify HMAC SHA256 signature
  const expected = crypto.createHmac('sha256', secret).update(bodyText).digest('hex');
  if (signature !== expected) {
    console.warn('[webhook] signature mismatch', { got: signature.slice(0, 8), expected: expected.slice(0, 8) });
    return NextResponse.json({ ok: false, error: 'signature-mismatch' }, { status: 401 });
  }

  // Safe parse after verification
  const evt = JSON.parse(bodyText);
  const type: string = evt?.event ?? 'unknown';
  const subId: string | undefined = evt?.payload?.subscription?.entity?.id;
  const payId: string | undefined = evt?.payload?.payment?.entity?.id;

  // Verified event logged consistently
  console.log('[webhook] verified', { type, subId, payId });

  // Optional, gated side-effects
  if (process.env.PAYMENT_EVENTS_ENABLED === 'true') {
    const res = await applyWebhookSideEffects(evt)
    if (res.applied) {
      console.log('[webhook][apply]', { type, action: res.action })
    } else {
      console.log('[webhook][skip]', { type, reason: res.reason })
    }
  }

  return NextResponse.json({ ok: true });
}
