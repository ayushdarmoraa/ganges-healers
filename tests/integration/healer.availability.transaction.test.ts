import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { GET, PUT } from '@/app/api/healer/availability/route'
import { getHealerAvailability, validateProgramSessionSlot } from '@/lib/availability'
import { readWeeklyAvailability, WEEK_DAYS } from '@/lib/bookings/availability-rules'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'
import { lockTransaction } from '@/lib/db/locks'
let mockUser = '', mockRole = 'HEALER'
jest.mock('@/lib/auth', () => ({ auth: async () => mockUser ? { user: { id: mockUser, role: mockRole } } : null }))
let userId = '', otherId = '', customerId = '', healerId = '', serviceId = ''
const original = Object.fromEntries(WEEK_DAYS.map(day => [day, { start: '10:00', end: '20:00' }]))
const wide = Object.fromEntries(WEEK_DAYS.map(day => [day, { start: '08:00', end: '24:00' }]))
const closed = Object.fromEntries(WEEK_DAYS.map(day => [day, null]))
function save(body: unknown, etag?: string) { return PUT(new NextRequest('http://localhost/api/healer/availability', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) }, body: JSON.stringify(body) })) }
const futureDate = () => clinicDate(new Date(Date.now() + 10 * 86400000))
beforeAll(async () => {
  userId = (await prisma.user.create({ data: { email: `availability-${randomUUID()}@example.test`, role: 'HEALER' } })).id
  otherId = (await prisma.user.create({ data: { email: `availability-other-${randomUUID()}@example.test`, role: 'HEALER' } })).id
  customerId = (await prisma.user.create({ data: { email: `availability-customer-${randomUUID()}@example.test` } })).id
  healerId = (await prisma.healer.create({ data: { userId, availability: original } })).id
  await prisma.healer.create({ data: { userId: otherId, availability: original } })
  serviceId = (await prisma.service.create({ data: { slug: `availability-${randomUUID()}`, name: 'Availability test', description: 'Fixture', category: 'Test', duration: 60, price: 100 } })).id
})
beforeEach(async () => {
  mockUser = userId; mockRole = 'HEALER'
  await prisma.user.update({ where: { id: userId }, data: { role: 'HEALER' } })
  await prisma.healer.update({ where: { id: healerId }, data: { availability: original } })
})
afterAll(async () => { try {
  await prisma.booking.deleteMany({ where: { healerId } })
  await prisma.user.deleteMany({ where: { id: { in: [userId, otherId, customerId] } } })
  await prisma.service.deleteMany({ where: { id: serviceId } })
} finally { await prisma.$disconnect() } })

test('private snapshots and validated saves preserve the legacy data shape with an owner-bound version', async () => {
  const response = await GET(); const tag = response.headers.get('etag')!
  expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect((await response.json()).data).toEqual(original)
  const updated = await save(wide, tag); expect(updated.status).toBe(200)
  const body = await updated.json(); expect(body).toMatchObject({ success: true, data: wide })
  expect(body.version).not.toBe(tag)
  expect((await GET()).headers.get('etag')).toBe(body.version)
})
test('authentication, current database role, and account ownership apply to reads and writes', async () => {
  mockUser = ''; expect((await GET()).status).toBe(401)
  mockUser = customerId; mockRole = 'USER'; expect((await save(wide)).status).toBe(403)
  mockUser = userId; mockRole = 'HEALER'
  const ownTag = (await GET()).headers.get('etag')!
  mockUser = otherId; const otherTag = (await GET()).headers.get('etag')!
  expect(otherTag).not.toBe(ownTag)
  expect((await save(wide, ownTag)).status).toBe(412)
  mockUser = userId
  await prisma.user.update({ where: { id: userId }, data: { role: 'USER' } })
  expect((await GET()).status).toBe(403)
  expect((await save(wide, ownTag)).status).toBe(403)
})
test('two concurrent edits from one snapshot cannot silently replace each other', async () => {
  const etag = (await GET()).headers.get('etag')!
  const results = await Promise.all([save(wide, etag), save(closed, etag)])
  expect(results.map(result => result.status).sort()).toEqual([200, 412])
  const winner = await results.find(result => result.status === 200)!.json()
  expect((await GET()).headers.get('etag')).toBe(winner.version)
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).availability).toEqual(winner.data)
})
test('legacy unconditional writes still normalize omitted days; invalid bodies never change saved hours', async () => {
  expect((await save({ monday: { start: '08:00', end: '12:00' } })).status).toBe(200)
  const expected = readWeeklyAvailability({ monday: { start: '08:00', end: '12:00' } })
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).availability).toEqual(expected)
  expect((await save({ monday: { start: '08:15', end: '12:00' } })).status).toBe(400)
  expect((await save({ ...wide, healerId: 'foreign' })).status).toBe(400)
  const malformed = new NextRequest('http://localhost/api/healer/availability', { method: 'PUT', body: '{' })
  expect((await PUT(malformed)).status).toBe(400)
  expect((await prisma.healer.findUniqueOrThrow({ where: { id: healerId } })).availability).toEqual(expected)
})
test('early/late public slots and program validation use the same saved window and actual duration', async () => {
  expect((await save(wide)).status).toBe(200)
  const date = futureDate()
  const slots = (await getHealerAvailability(healerId, date, 60)).slots
  expect(slots.find(slot => slot.time === '08:00')?.available).toBe(true)
  expect(slots.find(slot => slot.time === '23:00')?.available).toBe(true)
  expect(slots.find(slot => slot.time === '23:30')?.available).toBe(false)
  expect((await validateProgramSessionSlot(healerId, clinicSlotInstant(date, '23:00'), 60)).valid).toBe(true)
  expect((await validateProgramSessionSlot(healerId, clinicSlotInstant(date, '23:30'), 60)).valid).toBe(false)
  expect((await save(closed)).status).toBe(200)
  expect((await getHealerAvailability(healerId, date)).slots).toEqual([])
  expect((await validateProgramSessionSlot(healerId, clinicSlotInstant(date, '08:00'), 60)).valid).toBe(false)
})
test('an hours change preserves an existing confirmed appointment', async () => {
  const at = clinicSlotInstant(futureDate(), '10:00')
  const booking = await prisma.booking.create({ data: { userId: customerId, healerId, serviceId, scheduledAt: at, durationMin: 60, status: 'CONFIRMED', pricePaise: 10000 } })
  expect((await save(closed)).status).toBe(200)
  expect(await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: 'CONFIRMED', scheduledAt: at })
})
test('corrupt stored rules cannot open public slots or silently load an empty editable replacement', async () => {
  await prisma.healer.update({ where: { id: healerId }, data: { availability: { monday: { start: 'not-a-time', end: '20:00' } } } })
  expect((await GET()).status).toBe(409)
  expect((await getHealerAvailability(healerId, futureDate())).slots).toEqual([])
})
test('availability edits participate in the same advisory lock as booking reservations', async () => {
  const etag = (await GET()).headers.get('etag')!
  let acquired!: () => void, release!: () => void
  const locked = new Promise<void>(resolve => { acquired = resolve })
  const unlock = new Promise<void>(resolve => { release = resolve })
  const blocker = prisma.$transaction(async tx => {
    await lockTransaction(tx, 'healer', healerId); acquired(); await unlock
    await tx.healer.update({ where: { id: healerId }, data: { availability: closed } })
  }, { timeout: 15000 })
  await locked
  const waitingSave = save(wide, etag)
  try {
    let waiting = false
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted AND classid=72102::oid AND objid=(hashtext(${healerId})::bigint & 4294967295)::oid) AS waiting`
      if (rows[0].waiting) { waiting = true; break }
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    expect(waiting).toBe(true)
  } finally { release(); await blocker; await waitingSave }
  expect((await waitingSave).status).toBe(412)
})
