import { randomUUID, createHmac } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { POST as enrollProgram } from '@/app/api/programs/[slug]/enroll/route'
import { POST as verifyPayment } from '@/app/api/payments/verify/route'
import { POST as book } from '@/app/api/bookings/route'
import { GET as list } from '@/app/api/program-enrollments/route'
import { GET as detail, PATCH as update } from '@/app/api/program-enrollments/[id]/route'
import { GET as calendar } from '@/app/api/program-enrollments/[id]/sessions/[number]/calendar/route'
import { GET as bookingCalendar } from '@/app/api/bookings/[id]/calendar/route'
import { getHealerAvailability } from '@/lib/availability'
import { buildProgramSchedule } from '@/lib/programs/schedule'
import { archiveProgramCatalog, writeProgramCatalog } from '@/lib/programs/queries'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'

let mockUserId = ''
let mockRole = 'ADMIN'
jest.mock('@/lib/auth', () => ({ auth: async () => mockUserId ? { user: { id: mockUserId, role: mockRole } } : null }))
jest.mock('@/lib/razorpay', () => ({ getRazorpayClient: async () => ({ orders: { create: async (input: { amount: number }) => ({ ...input, id: `order_${randomUUID()}` }) } }) }))
jest.mock('@/lib/analytics/session', () => ({ getSessionId: async () => null, getExperimentVariants: async () => ({}) }))
let adminId = '', ownerId = '', outsiderId = '', staffId = '', otherStaffId = '', healerId = '', otherHealerId = '', serviceId = ''
const programIds: string[] = []
const allDay = Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => [day, { start: '10:00', end: '20:00' }]))
const req = (body: unknown) => new Request('http://localhost/api/program-enrollments', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
function change(id: string, body: unknown) { return update(req(body), { params: Promise.resolve({ id }) }) }
const testEpoch = Date.now()
function at(offset = 10, time = '10:00') { return clinicSlotInstant(clinicDate(new Date(testEpoch + offset * 86400000)), time) }
async function fixture(status: 'active' | 'pending_payment' | 'paused' = 'active', total = 2, assigned: string | null = healerId) {
  const p = await prisma.program.create({ data: { title: 'Session Program', slug: `sessions-${randomUUID()}`, description: 'Test', pricePaise: 25000, totalSessions: total, sessionsPerWeek: 2, durationMinutes: 60 } }); programIds.push(p.id)
  return prisma.programEnrollment.create({ data: { userId: ownerId, programId: p.id, status, healerId: assigned, pricePaise: 25000, schedule: buildProgramSchedule(total, 2, 60, at()).sessions }, include: { program: true } })
}
beforeAll(async () => {
  const createUser = (role: 'ADMIN' | 'USER' | 'HEALER') => prisma.user.create({ data: { email: `program-session-${randomUUID()}@example.test`, role, name: role } })
  adminId = (await createUser('ADMIN')).id; ownerId = (await createUser('USER')).id; outsiderId = (await createUser('USER')).id
  staffId = (await createUser('HEALER')).id; otherStaffId = (await createUser('HEALER')).id
  healerId = (await prisma.healer.create({ data: { userId: staffId, availability: allDay } })).id
  otherHealerId = (await prisma.healer.create({ data: { userId: otherStaffId, availability: allDay } })).id
  serviceId = (await prisma.service.create({ data: { slug: `session-conflict-${randomUUID()}`, name: 'Booking Conflict', category: 'test', description: 'Test', price: 250, duration: 60 } })).id
})
beforeEach(() => { mockUserId = adminId; mockRole = 'ADMIN' })
afterAll(async () => {
  try {
    await prisma.program.deleteMany({ where: { id: { in: programIds } } })
    await prisma.booking.deleteMany({ where: { healerId: { in: [healerId, otherHealerId] } } })
    await prisma.service.deleteMany({ where: { id: serviceId } })
    await prisma.payment.deleteMany({ where: { userId: { in: [ownerId, adminId] } } })
    await prisma.user.deleteMany({ where: { id: { in: [adminId, ownerId, outsiderId, staffId, otherStaffId] } } })
  } finally { await prisma.$disconnect() }
})

test('private enrollment lists and detail enforce the current database identity and role', async () => {
  const row = await fixture()
  mockUserId = outsiderId
  expect((await detail(req({}), { params: Promise.resolve({ id: row.id }) })).status).toBe(404)
  expect((await list(new Request('http://localhost/api/program-enrollments?scope=admin'))).status).toBe(403)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at().toISOString() })).status).toBe(403)
  mockUserId = ownerId
  const owned = await list(new Request('http://localhost/api/program-enrollments'))
  expect(owned.status).toBe(200)
  const found = (await owned.json()).items.find((item: { id: string }) => item.id === row.id)
  expect(found.canManage).toBe(false)
  expect(found).not.toHaveProperty('customerEmail')
  expect(found.sessions[0]).toMatchObject({ status: 'proposed', scheduledAt: null })
  mockUserId = ''
  expect((await list(new Request('http://localhost/api/program-enrollments'))).status).toBe(401)
})
test('a confirmed program reservation blocks public availability and ordinary bookings', async () => {
  const row = await fixture()
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at().toISOString() })).status).toBe(200)
  expect((await getHealerAvailability(healerId, clinicDate(at()))).slots.find(slot => slot.time === '10:00')?.available).toBe(false)
  const response = await book(new NextRequest('http://localhost/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ healerId, serviceId, scheduledAt: at().toISOString() }) }))
  expect(response.status).toBe(409)
})
test('ordinary booking and program reservation races cannot both reserve the same interval', async () => {
  const row = await fixture()
  const scheduledAt = at(12).toISOString()
  const responses = await Promise.all([
    change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt }),
    book(new NextRequest('http://localhost/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ healerId, serviceId, scheduledAt }) })),
  ])
  expect(responses.filter(response => response.status === 200 || response.status === 201)).toHaveLength(1)
  expect(responses.filter(response => response.status === 409)).toHaveLength(1)
})
test('concurrent program reservations and repeats cannot create duplicate sessions or overlap', async () => {
  const first = await fixture(), second = await fixture()
  const responses = await Promise.all([change(first.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(14).toISOString() }), change(second.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(14).toISOString() })])
  expect(responses.map(row => row.status).sort()).toEqual([200, 409])
  const winner = responses[0].status === 200 ? first : second
  expect((await change(winner.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(14).toISOString() })).status).toBe(200)
  expect(await prisma.programSession.count({ where: { enrollmentId: winner.id } })).toBe(1)
})
test('rescheduling excludes its own old reservation but cannot overlap another booking', async () => {
  const row = await fixture()
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(16).toISOString() })).status).toBe(200)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(16, '10:30').toISOString() })).status).toBe(200)
  await prisma.booking.create({ data: { userId: ownerId, healerId, serviceId, scheduledAt: at(16, '12:00'), durationMin: 60, pricePaise: 25000 } })
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(16, '12:00').toISOString() })).status).toBe(409)
})
test('cancelling a reservation releases capacity and pausing prevents duplicate checkout', async () => {
  const row = await fixture()
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(18).toISOString() })).status).toBe(200)
  expect((await change(row.id, { action: 'pause' })).status).toBe(409)
  expect((await change(row.id, { action: 'cancel', sessionNumber: 1 })).status).toBe(200)
  expect((await getHealerAvailability(healerId, clinicDate(at(18)))).slots.find(slot => slot.time === '10:00')?.available).toBe(true)
  expect((await change(row.id, { action: 'pause' })).status).toBe(200)
  mockUserId = ownerId
  const retry = await enrollProgram(req({}), { params: Promise.resolve({ slug: row.program.slug }) })
  expect(retry.status).toBe(409); expect((await retry.json()).enrolled).toBe(true)
  mockUserId = adminId
  expect((await change(row.id, { action: 'resume' })).status).toBe(200)
})
test('only an assigned practitioner or admin can complete an ended reservation, once', async () => {
  const row = await fixture('active', 1)
  await prisma.programSession.create({ data: { enrollmentId: row.id, healerId, sessionNumber: 1, durationMin: 60, scheduledAt: new Date(Date.now() - 7200000) } })
  mockUserId = ownerId
  expect((await change(row.id, { action: 'complete', sessionNumber: 1 })).status).toBe(403)
  mockUserId = otherStaffId
  expect((await change(row.id, { action: 'complete', sessionNumber: 1 })).status).toBe(404)
  mockUserId = staffId
  const response = await change(row.id, { action: 'complete', sessionNumber: 1 })
  expect(response.status).toBe(200)
  expect((await response.json()).data).toMatchObject({ status: 'completed', completedSessions: 1, progressPercent: 100 })
  const repeat = await change(row.id, { action: 'complete', sessionNumber: 1 })
  expect((await repeat.json()).idempotent).toBe(true)
  expect((await prisma.programEnrollment.findUniqueOrThrow({ where: { id: row.id } })).progress).toMatchObject({ sessionsCompleted: 1, percentComplete: 100 })
})
test('unpaid enrollments, future completion, out-of-window dates and unsafe links cannot be forged', async () => {
  const pending = await fixture('pending_payment')
  expect((await change(pending.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20).toISOString() })).status).toBe(409)
  const row = await fixture()
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20, '10:10').toISOString() })).status).toBe(409)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20, '19:30').toISOString() })).status).toBe(409)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 3, scheduledAt: at(20).toISOString() })).status).toBe(409)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20).toISOString(), meetingLink: 'javascript:alert(1)' })).status).toBe(400)
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(20).toISOString() })).status).toBe(200)
  expect((await change(row.id, { action: 'complete', sessionNumber: 1 })).status).toBe(409)
})
test('owned calendar exports use confirmed rows and keep another customer’s enrollment private', async () => {
  const row = await fixture()
  const context = { params: Promise.resolve({ id: row.id, number: '1' }) }
  mockUserId = ownerId
  expect((await calendar(req({}), context)).status).toBe(404)
  mockUserId = adminId
  expect((await change(row.id, { action: 'schedule', sessionNumber: 1, scheduledAt: at(22).toISOString(), meetingLink: 'https://example.test/session' })).status).toBe(200)
  mockUserId = ownerId
  const exported = await calendar(req({}), context)
  expect(exported.headers.get('cache-control')).toBe('private, no-store')
  const text = await exported.text(); expect(text).toContain('STATUS:CONFIRMED'); expect(text).toContain('URL:https://example.test/session')
  mockUserId = outsiderId
  expect((await calendar(req({}), context)).status).toBe(404)
})
test('booking calendar access is scoped and preserves tentative/cancelled status', async () => {
  const row = await prisma.booking.create({ data: { userId: ownerId, healerId, serviceId, scheduledAt: at(24), durationMin: 60, pricePaise: 25000 } })
  const context = { params: Promise.resolve({ id: row.id }) }
  mockUserId = ownerId; mockRole = 'USER'
  const own = await bookingCalendar(req({}), context)
  expect(own.status).toBe(200); expect(await own.text()).toContain('STATUS:TENTATIVE')
  mockUserId = outsiderId
  expect((await bookingCalendar(req({}), context)).status).toBe(404)
  await prisma.booking.update({ where: { id: row.id }, data: { status: 'CANCELLED' } })
  mockUserId = ownerId
  expect(await (await bookingCalendar(req({}), context)).text()).toContain('STATUS:CANCELLED')
})
test('catalog edits after checkout cannot alter purchased session count or duration, and assignment preserves payment replay', async () => {
  const row = await fixture('pending_payment', 2, null)
  await prisma.programEnrollment.delete({ where: { id: row.id } })
  mockUserId = ownerId
  const purchase = await enrollProgram(req({}), { params: Promise.resolve({ slug: row.program.slug }) })
  expect(purchase.status).toBe(200)
  const body = await purchase.json()
  await prisma.program.update({ where: { id: row.programId }, data: { totalSessions: 8, durationMinutes: 120, pricePaise: 99000 } })
  const paymentId = `pay_${randomUUID()}`
  const signature = createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!).update(`${body.orderId}|${paymentId}`).digest('hex')
  const verified = () => verifyPayment(new Request('http://localhost/api/payments/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: body.orderId, paymentId, signature }) }))
  expect((await verified()).status).toBe(200)
  const before = await prisma.programEnrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } })
  expect((before.schedule as Array<{ durationMinutes: number }>)).toHaveLength(2)
  expect((before.schedule as Array<{ durationMinutes: number }>)[0].durationMinutes).toBe(60)
  mockUserId = adminId
  expect((await change(body.enrollmentId, { action: 'assign', healerId: otherHealerId })).status).toBe(200)
  const assigned = await prisma.programEnrollment.findUniqueOrThrow({ where: { id: body.enrollmentId } })
  expect(assigned.healerId).toBeNull(); expect(assigned.assignedHealerId).toBe(otherHealerId)
  mockUserId = ownerId
  expect((await verified()).status).toBe(200)
  expect(await prisma.payment.count({ where: { userId: ownerId, gatewayOrderId: body.orderId } })).toBe(1)
})
test('catalog deletion archives purchased programs, preserves their sessions and requires an actual admin', async () => {
  const row = await fixture()
  await expect(archiveProgramCatalog(ownerId, row.programId)).rejects.toMatchObject({ status: 403 })
  await expect(writeProgramCatalog(adminId, { title: 'Bad', description: 'Bad', totalSessions: 10000000 }, row.programId)).rejects.toMatchObject({ status: 400 })
  await archiveProgramCatalog(adminId, row.programId)
  expect((await prisma.program.findUniqueOrThrow({ where: { id: row.programId } })).isActive).toBe(false)
  expect(await prisma.programEnrollment.findUnique({ where: { id: row.id } })).not.toBeNull()
})
