import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET as listHealer } from '@/app/api/healer/bookings/route'
import { PATCH } from '@/app/api/healer/bookings/[id]/route'
import { GET as listCustomer } from '@/app/api/bookings/route'
import { GET as calendar } from '@/app/api/bookings/[id]/calendar/route'
import { lockTransaction } from '@/lib/db/locks'

let mockActor: { user: { id: string; role: string } } | null
jest.mock('@/lib/auth', () => ({ auth: jest.fn(async () => mockActor) }))
const users: string[] = [], healers: string[] = []
let serviceId = '', bookingId = ''
const request = (body: object) => new NextRequest('http://localhost/api/healer/bookings/booking', { method: 'PATCH', body: JSON.stringify(body) })
const params = () => ({ params: Promise.resolve({ id: bookingId }) })
const patch = (body: object) => PATCH(request(body), params())
const fresh = () => prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })
const link = async (meetingLink: string | null, version?: string) => patch({ action: 'SET_MEETING_LINK', meetingLink, version: version ?? (await fresh()).updatedAt.toISOString() })
beforeAll(async () => {
  for (const role of ['HEALER', 'HEALER', 'USER'] as const) {
    const user = await prisma.user.create({ data: { email: `delivery-${randomUUID()}@example.test`, role, freeSessionCredits: 2 } }); users.push(user.id)
    if (role === 'HEALER') healers.push((await prisma.healer.create({ data: { userId: user.id } })).id)
  }
  serviceId = (await prisma.service.create({ data: { name: 'Delivery Service', slug: `delivery-${randomUUID()}`, description: 'Isolated session delivery', category: 'Test', price: 10, duration: 60 } })).id
})
beforeEach(async () => {
  mockActor = { user: { id: users[0], role: 'HEALER' } }
  bookingId = (await prisma.booking.create({ data: { userId: users[2], healerId: healers[0], serviceId, scheduledAt: new Date(Date.now() + 86400000), durationMin: 60, status: 'CONFIRMED', pricePaise: 1000, payment: { create: { gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 1000 } } } })).id
})
afterAll(async () => {
  try {
    await prisma.activityLog.deleteMany({ where: { userId: { in: users } } })
    await prisma.user.deleteMany({ where: { id: { in: users } } })
    if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  } finally { await prisma.$disconnect() }
})

test('an owned session link reaches customer bookings and private calendar without changing appointment or payment', async () => {
  const before = await fresh(), payment = await prisma.payment.findUniqueOrThrow({ where: { bookingId } })
  const response = await link('https://meeting.example.test/session')
  expect(response.status).toBe(200)
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(await fresh()).toMatchObject({ scheduledAt: before.scheduledAt, status: before.status, durationMin: before.durationMin, pricePaise: before.pricePaise, meetingLink: 'https://meeting.example.test/session' })
  expect(await prisma.payment.findUniqueOrThrow({ where: { bookingId } })).toEqual(payment)
  const audit = await prisma.activityLog.findFirstOrThrow({ where: { entityId: bookingId, action: 'booking_meeting_link_updated' } })
  expect(JSON.stringify(audit.metadata)).not.toContain('meeting.example.test')
  mockActor = { user: { id: users[2], role: 'USER' } }
  const listed = await listCustomer(new NextRequest('http://localhost/api/bookings'))
  expect(listed.headers.get('cache-control')).toBe('private, no-store')
  expect((await listed.json()).data.find((row: { id: string }) => row.id === bookingId)).toMatchObject({ meetingLink: 'https://meeting.example.test/session' })
  const exported = await calendar(new Request('http://localhost/calendar'), params())
  expect(await exported.text()).toContain('URL:https://meeting.example.test/session')
})

test('foreign healers, ordinary users, missing sessions and revoked roles cannot manage another appointment', async () => {
  mockActor = { user: { id: users[1], role: 'HEALER' } }
  expect((await link('https://meeting.example.test/foreign')).status).toBe(403)
  expect((await (await listHealer(new NextRequest('http://localhost/api/healer/bookings'))).json()).data.map((row: { id: string }) => row.id)).not.toContain(bookingId)
  mockActor = { user: { id: users[2], role: 'USER' } }; expect((await link(null)).status).toBe(403)
  mockActor = null; expect((await link(null)).status).toBe(401)
  mockActor = { user: { id: users[0], role: 'HEALER' } }
  try {
    await prisma.user.update({ where: { id: users[0] }, data: { role: 'USER' } })
    expect((await link(null)).status).toBe(403)
  } finally { await prisma.user.update({ where: { id: users[0] }, data: { role: 'HEALER' } }) }
})

test('two competing link versions cannot overwrite each other and cancelled sessions cannot be revived', async () => {
  const version = (await fresh()).updatedAt.toISOString()
  const responses = await Promise.all([link('https://meeting.example.test/one', version), link('https://meeting.example.test/two', version)])
  expect(responses.map(response => response.status).sort()).toEqual([200, 409])
  expect(await prisma.activityLog.count({ where: { entityId: bookingId, action: 'booking_meeting_link_updated' } })).toBe(1)
  const saved = await fresh(); expect(saved.meetingLink).toMatch(/\/(one|two)$/)
  expect((await link(null, version)).status).toBe(409)
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } })
  expect((await link('https://meeting.example.test/revive')).status).toBe(409)
  expect((await fresh()).status).toBe('CANCELLED')
})

test('meeting writes require safe HTTPS, the saved version and an active confirmed session', async () => {
  for (const meetingLink of ['javascript:alert(1)', 'http://meeting.example.test', 'https://user:password@meeting.example.test']) expect((await link(meetingLink)).status).toBe(400)
  expect((await patch({ action: 'SET_MEETING_LINK', meetingLink: 'https://meeting.example.test' })).status).toBe(400)
  expect((await PATCH(new NextRequest('http://localhost/action', { method: 'PATCH', body: '{' }), params())).status).toBe(400)
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PENDING' } })
  expect((await link('https://meeting.example.test')).status).toBe(409)
})

test('completion waits for the scheduled end and supports an ended rescheduled session', async () => {
  expect((await patch({ action: 'COMPLETE' })).status).toBe(409)
  for (const status of ['CONFIRMED', 'RESCHEDULED'] as const) {
    await prisma.booking.update({ where: { id: bookingId }, data: { scheduledAt: new Date(Date.now() - 7200000), status } })
    expect((await patch({ action: 'COMPLETE' })).status).toBe(200)
    expect((await fresh()).status).toBe('COMPLETED')
    expect((await patch({ action: 'COMPLETE' })).status).toBe(400)
  }
})

test('unpaid positive-price confirmation is refused and a genuinely free pending booking can be confirmed', async () => {
  await prisma.payment.delete({ where: { bookingId } })
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PENDING' } })
  expect((await patch({ action: 'CONFIRM' })).status).toBe(409)
  await prisma.booking.update({ where: { id: bookingId }, data: { pricePaise: 0 } })
  expect((await patch({ action: 'CONFIRM' })).status).toBe(200)
})

test('practitioner cancellation cannot discard a captured payment or used credit; unpaid holds can be released', async () => {
  expect((await patch({ action: 'CANCEL' })).status).toBe(409)
  expect((await fresh()).status).toBe('CONFIRMED')
  await prisma.payment.update({ where: { bookingId }, data: { gateway: 'vip_credit', amountPaise: 0, statusEnum: null } })
  const credits = (await prisma.user.findUniqueOrThrow({ where: { id: users[2] } })).freeSessionCredits
  expect((await patch({ action: 'CANCEL' })).status).toBe(409)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: users[2] } })).freeSessionCredits).toBe(credits)
  await prisma.payment.delete({ where: { bookingId } })
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'PENDING' } })
  expect((await patch({ action: 'CANCEL' })).status).toBe(200)
  expect((await fresh()).status).toBe('CANCELLED')
})

test('a role revoked while waiting for the reservation lock is rechecked before a meeting write', async () => {
  const version = (await fresh()).updatedAt.toISOString()
  let acquired!: () => void, release!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve })
  const blocker = prisma.$transaction(async tx => {
    await lockTransaction(tx, 'healer', healers[0]); acquired(); await unlock
    await tx.user.update({ where: { id: users[0] }, data: { role: 'USER' } })
  }, { timeout: 15000 })
  await locked
  const waiting = link('https://meeting.example.test/revoked', version)
  try {
    let queued = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=72102::oid AND objid=(hashtext(${healers[0]})::bigint & 4294967295)::oid) AS waiting`
      if (rows[0].waiting) { queued = true; break }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(queued).toBe(true)
  } finally {
    release(); await blocker; await waiting
    await prisma.user.update({ where: { id: users[0] }, data: { role: 'HEALER' } })
  }
  expect((await waiting).status).toBe(403)
  expect((await fresh()).meetingLink).toBeNull()
})
