// src/app/api/payments/webhook/route.ts
import { NextResponse } from 'next/server';
import crypto from 'crypto';
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

  // For now, just log. (We’ll wire DB updates next.)
  console.log('[webhook] verified', { type, subId, payId });

  // Example: where to hook your logic later
  // if (type === 'subscription.activated' && subId) {
  //   await prisma.vIPMembership.updateMany({
  //     where: { razorpaySubscriptionId: subId },
  //     data: { status: 'ACTIVE' }
  //   });
  // }
  // if (type === 'subscription.cancelled' && subId) { ... }
  // if (type === 'payment.captured' && payId) { ... }

  return NextResponse.json({ ok: true });
}
