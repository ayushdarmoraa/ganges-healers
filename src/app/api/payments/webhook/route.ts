import { isTestMode } from '@/lib/test-mode'
// src/app/api/payments/webhook/route.ts
// Verify the raw request before any gated payment side effects.
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { applyWebhookSideEffects } from '@/lib/payments/webhook-apply'

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
  if (!/^[a-f0-9]{64}$/i.test(signature) || !crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
    console.warn('[webhook] signature mismatch');
    return NextResponse.json({ ok: false, error: 'signature-mismatch' }, { status: 401 });
  }

  // Safe parse after verification
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Razorpay webhook payload is untyped external JSON
  let evt: any
  try {
    evt = JSON.parse(bodyText)
  } catch (err) {
    if (isTestMode()) {
      console.error('[TEST_MODE] JSON parse failed in payments webhook', err instanceof Error ? err.name : 'invalid-json')
    }
    console.error('[webhook] invalid payload')
    return NextResponse.json({ ok: false, error: 'invalid-payload' }, { status: 400 })
  }
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
      if (res.reason === 'apply-error') return NextResponse.json({ ok: false, error: 'apply-error' }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true });
}
