/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from 'crypto';
import { addDays, setHours, setMinutes } from 'date-fns';
import { prisma } from '@/lib/prisma'; // adjust if your prisma client is elsewhere
import { NextRequest } from 'next/server';

// Helpers
import { makeNextRequest, readJSON } from '../helpers/next-handler';

// Handlers
import * as Bookings from '@/app/api/bookings/route'; // POST /api/bookings
import * as ConfirmCredits from '@/app/api/bookings/[id]/confirm-with-credits/route';
import * as Order from '@/app/api/payments/razorpay/order/route';
import * as Webhook from '@/app/api/payments/razorpay/webhook/route';

// ---- Helpers ----
function iso(d: Date) { return new Date(d).toISOString(); }

// Mock Razorpay SDK
jest.mock('@/lib/razorpay', () => ({
  razorpay: {
    orders: {
      create: jest.fn().mockResolvedValue({
        id: 'order_test_123',
        amount: 50000,
        currency: 'INR',
        status: 'created'
      }),
    },
  },
}));

// Mock auth() -> we will switch between normal and VIP users by env
jest.mock('@/lib/auth', () => {
  return {
    auth: async () => ({
      user: {
        id: process.env.TEST_USER_ID,
        role: process.env.TEST_USER_ROLE ?? 'USER',
        vip: process.env.TEST_USER_VIP === 'true',
        freeSessionCredits: Number(process.env.TEST_USER_CREDITS ?? 0),
        email: 'itest@example.com',
      }
    }),
  };
});

jest.setTimeout(30000);

describe('Payments integration', () => {
  let user: any;
  let vipUser: any;
  let healer: any;
  let service: any;
  let bookingForVip: any;
  let bookingForRzp: any;

  beforeAll(async () => {
    // Base data
    service = await prisma.service.findFirst({ where: { isActive: true } });
    healer = await prisma.healer.findFirst();
    if (!service || !healer) throw new Error('Seed missing service/healer for tests');

    // Make healer wide-open to avoid flaky availability
    const wideOpen = {
      monday: { start: '10:00', end: '20:00' },
      tuesday: { start: '10:00', end: '20:00' },
      wednesday: { start: '10:00', end: '20:00' },
      thursday: { start: '10:00', end: '20:00' },
      friday: { start: '10:00', end: '20:00' },
      saturday: { start: '10:00', end: '20:00' },
      sunday: { start: '10:00', end: '20:00' },
    };
    await prisma.healer.update({ where: { id: healer.id }, data: { availability: wideOpen } });

    // Create a normal user (for Razorpay flow)
    user = await prisma.user.create({
      data: { email: `rzp_${Date.now()}@ex.com`, password: 'hashed', role: 'USER', vip: false, freeSessionCredits: 0 }
    });

    // Create a VIP user with credits
    vipUser = await prisma.user.create({
      data: { email: `vip_${Date.now()}@ex.com`, password: 'hashed', role: 'USER', vip: true, freeSessionCredits: 1 }
    });

    // Create a PENDING booking for VIP (>24h, aligned 30-min)
    {
      process.env.TEST_USER_ID = vipUser.id;
      process.env.TEST_USER_ROLE = 'USER';
      process.env.TEST_USER_VIP = 'true';
      process.env.TEST_USER_CREDITS = '1';

      const future = setMinutes(setHours(addDays(new Date(), 3), 11), 0);
      const req = makeNextRequest('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          healerId: healer.id,
          serviceId: service.id,
          scheduledAt: iso(future)
        })
      });
      const res = await (Bookings as any).POST(req);
      expect(res.status).toBeLessThan(300);
      const body = await readJSON(res);
      bookingForVip = body?.booking ?? body?.data ?? body;
      expect(bookingForVip?.status).toBe('PENDING');
    }

    // Create a PENDING booking for Razorpay user (>24h)
    {
      process.env.TEST_USER_ID = user.id;
      process.env.TEST_USER_ROLE = 'USER';
      process.env.TEST_USER_VIP = 'false';
      process.env.TEST_USER_CREDITS = '0';

      const future = setMinutes(setHours(addDays(new Date(), 4), 12), 0);
      const req = makeNextRequest('http://localhost/api/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          healerId: healer.id,
          serviceId: service.id,
          scheduledAt: iso(future)
        })
      });
      const res = await (Bookings as any).POST(req);
      expect(res.status).toBeLessThan(300);
      const body = await readJSON(res);
      bookingForRzp = body?.booking ?? body?.data ?? body;
      expect(bookingForRzp?.status).toBe('PENDING');
    }
  });

  afterAll(async () => {
    // Clean payments -> bookings -> users
    if (bookingForVip?.id || bookingForRzp?.id) {
      await prisma.payment.deleteMany({ where: { booking: { id: { in: [bookingForVip?.id, bookingForRzp?.id].filter(Boolean) } } } });
      await prisma.booking.deleteMany({ where: { id: { in: [bookingForVip?.id, bookingForRzp?.id].filter(Boolean) } } });
    }
    if (user?.id) await prisma.user.delete({ where: { id: user.id } }).catch(()=>{});
    if (vipUser?.id) await prisma.user.delete({ where: { id: vipUser.id } }).catch(()=>{});
    await prisma.$disconnect();
  });

  test('VIP credits confirmation: decrements credit and confirms booking', async () => {
    // Ensure we act as VIP user
    process.env.TEST_USER_ID = vipUser.id;
    process.env.TEST_USER_VIP = 'true';
    process.env.TEST_USER_CREDITS = '1';

    const req = makeNextRequest(`http://localhost/api/bookings/${bookingForVip.id}/confirm-with-credits`, { method: 'POST' });
    const res = await (ConfirmCredits as any).POST(req, { params: Promise.resolve({ id: bookingForVip.id }) });
    expect(res.status).toBeLessThan(300);

    const refreshed = await prisma.booking.findUnique({ where: { id: bookingForVip.id } });
    expect(refreshed?.status).toBe('CONFIRMED');

    const vipAfter = await prisma.user.findUnique({ where: { id: vipUser.id } });
    expect(vipAfter?.freeSessionCredits).toBe(0);

    const payment = await prisma.payment.findUnique({ where: { bookingId: bookingForVip.id } });
    expect(payment?.gateway).toBe('vip_credit');
    expect(payment?.status).toBe('success');
  });

  test('Razorpay order API: creates/returns order & Payment pending', async () => {
    // Act as normal user (no VIP)
    process.env.TEST_USER_ID = user.id;
    process.env.TEST_USER_VIP = 'false';
    process.env.TEST_USER_CREDITS = '0';

    const req = makeNextRequest('http://localhost/api/payments/razorpay/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bookingId: bookingForRzp.id })
    });
    const res = await (Order as any).POST(req);
    expect(res.status).toBeLessThan(300);
    const body = await readJSON(res);

    // store orderId for webhook
    const orderId = body?.order?.id || body?.orderId || body?.data?.orderId;
    expect(orderId).toBeTruthy();

    const payment = await prisma.payment.findUnique({ where: { bookingId: bookingForRzp.id } });
    expect(payment?.status).toBe('pending');
    expect(payment?.gateway).toBe('razorpay');

    // stash on process for the next test
    (global as any).__TEST_RZP_ORDER__ = orderId;
  });

  test('Webhook: valid signature confirms payment and booking (idempotent)', async () => {
    const orderId = (global as any).__TEST_RZP_ORDER__;
    expect(orderId).toBeTruthy();

    // Simulate Razorpay "payment.captured" payload
    const payload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_123',
            order_id: orderId,
            amount: (await prisma.payment.findUnique({ where: { bookingId: bookingForRzp.id } }))!.amountPaise ?? 50000,
            currency: 'INR',
            status: 'captured',
            notes: {
              bookingId: bookingForRzp.id
            }
          }
        }
      }
    };
    const bodyText = JSON.stringify(payload);

    // Compute signature using our test secret
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook';
    const signature = crypto.createHmac('sha256', secret).update(bodyText).digest('hex');

    // Build NextRequest manually with raw body and header
    const req1 = new NextRequest(new Request('http://localhost/api/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature },
      body: bodyText,
    }) as any);

    const res1 = await (Webhook as any).POST(req1);
    expect(res1.status).toBeLessThan(300);

    // Re-run same payload (idempotency)
    const req2 = new NextRequest(new Request('http://localhost/api/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature },
      body: bodyText,
    }) as any);
    const res2 = await (Webhook as any).POST(req2);
    expect(res2.status).toBeLessThan(300);

    // Verify final state: Payment success, Booking CONFIRMED
    const payment = await prisma.payment.findUnique({ where: { bookingId: bookingForRzp.id } });
    expect(payment?.status).toBe('success');
    expect(payment?.paymentId).toBe('pay_test_123');

    const booking = await prisma.booking.findUnique({ where: { id: bookingForRzp.id } });
    expect(booking?.status).toBe('CONFIRMED');
  });

  test('Webhook: invalid signature is rejected', async () => {
    const payload = { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_bad', order_id: 'order_bad' }}}};
    const bodyText = JSON.stringify(payload);

    const reqBad = new NextRequest(new Request('http://localhost/api/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'not-valid' },
      body: bodyText,
    }) as any);

    const res = await (Webhook as any).POST(reqBad);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});