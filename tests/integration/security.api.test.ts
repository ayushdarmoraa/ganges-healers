/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma';
import { addDays, setHours, setMinutes } from 'date-fns';

// Handlers
import * as Bookings from '@/app/api/bookings/route';
import * as ById from '@/app/api/bookings/[id]/route';
import * as ConfirmCredits from '@/app/api/bookings/[id]/confirm-with-credits/route';

function iso(d: Date) { return new Date(d).toISOString(); }
async function readJSON(res: Response) { try { return await res.clone().json(); } catch { return null; } }
function req(url: string, init?: RequestInit) { return new Request(url, init); }

// Default mock: will be overridden per test to simulate different users / auth states
jest.mock('@/lib/auth', () => ({
  auth: async () => ({
    user: process.env.TEST_USER_ID ? {
      id: process.env.TEST_USER_ID,
      role: process.env.TEST_USER_ROLE ?? 'USER',
      vip: process.env.TEST_USER_VIP === 'true',
      freeSessionCredits: Number(process.env.TEST_USER_CREDITS ?? 0),
      email: 'rbac@example.com',
    } : null, // when unset -> unauthenticated
  }),
}));

jest.setTimeout(20000);

describe('RBAC/Security', () => {
  let userA: any;
  let userB: any;
  let healer: any;
  let service: any;
  let bookingOfA: any;

  beforeAll(async () => {
    service = await prisma.service.findFirst({ where: { isActive: true } });
    healer = await prisma.healer.findFirst();
    if (!service || !healer) throw new Error('Seed missing service/healer');

    // open healer availability fully to avoid flakes
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

    userA = await prisma.user.create({ data: { email: `a_${Date.now()}@ex.com`, password: 'x', role: 'USER', vip: true, freeSessionCredits: 1 } });
    userB = await prisma.user.create({ data: { email: `b_${Date.now()}@ex.com`, password: 'x', role: 'USER', vip: false, freeSessionCredits: 0 } });

    // Create a booking that belongs to A
    process.env.TEST_USER_ID = userA.id;
    const when = setMinutes(setHours(addDays(new Date(), 5), 11), 0);
    const createReq = req('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer.id, serviceId: service.id, scheduledAt: iso(when) }),
    });
    const createdRes = await (Bookings as any).POST(createReq);
    const body = await readJSON(createdRes);
    bookingOfA = body?.booking ?? body?.data ?? body;
  });

  afterAll(async () => {
    await prisma.payment.deleteMany({ where: { booking: { id: bookingOfA?.id } } });
    await prisma.booking.deleteMany({ where: { id: bookingOfA?.id } });
    await prisma.user.delete({ where: { id: userA.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: userB.id } }).catch(() => {});
    await prisma.$disconnect();
  });

  test('Non-owner cannot reschedule someone else booking', async () => {
    process.env.TEST_USER_ID = userB.id; // act as B
    const target = setMinutes(setHours(addDays(new Date(), 6), 12), 0);

    const rReq = req(`http://localhost/api/bookings/${bookingOfA.id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scheduledAt: iso(target) }),
    });
    const rRes = await (ById as any).PUT(rReq, { params: Promise.resolve({ id: bookingOfA.id }) });
    expect(rRes.status).toBeGreaterThanOrEqual(400);
    const body = await readJSON(rRes);
    // "booking not found" is correct security behavior - don't reveal booking exists if user doesn't own it
    expect((body?.error || '').toLowerCase()).toMatch(/(forbidden|owner|not.*allowed|unauthorized|booking not found)/i);
  });

  test('Non-owner cannot cancel someone else booking', async () => {
    process.env.TEST_USER_ID = userB.id;
    const dReq = req(`http://localhost/api/bookings/${bookingOfA.id}`, { method: 'DELETE' });
    const dRes = await (ById as any).DELETE(dReq, { params: Promise.resolve({ id: bookingOfA.id }) });
    expect(dRes.status).toBeGreaterThanOrEqual(400);
  });

  test('Non-owner cannot confirm-with-credits for someone else booking', async () => {
    process.env.TEST_USER_ID = userB.id;
    const cReq = req(`http://localhost/api/bookings/${bookingOfA.id}/confirm-with-credits`, { method: 'POST' });
    const cRes = await (ConfirmCredits as any).POST(cReq, { params: Promise.resolve({ id: bookingOfA.id }) });
    expect(cRes.status).toBeGreaterThanOrEqual(400);
  });

  // Legacy order API security tests removed post-migration.

  test('GET /api/bookings returns only current user bookings', async () => {
    // create one booking for userB to ensure isolation
    process.env.TEST_USER_ID = userB.id;
    const when = setMinutes(setHours(addDays(new Date(), 7), 13), 0);
    const bReq = req('http://localhost/api/bookings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ healerId: healer.id, serviceId: service.id, scheduledAt: iso(when) }),
    });
    await (Bookings as any).POST(bReq);

    // list as userB and verify none from userA appear
    const listReq = req('http://localhost/api/bookings', { method: 'GET' });
    const listRes = await (Bookings as any).GET(listReq);
    expect(listRes.status).toBeLessThan(300);
    const body = await readJSON(listRes);
    const items = body?.bookings ?? body?.data ?? [];
    expect(Array.isArray(items)).toBe(true);
    expect(items.every((b: any) => b.userId === userB.id)).toBe(true);
  });
});