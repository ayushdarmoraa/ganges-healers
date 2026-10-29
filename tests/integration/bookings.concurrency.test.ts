import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { clinicDate, clinicSlotInstant } from '@/lib/bookings/time'
import { makeNextRequest } from '../helpers/next-handler'
import { POST } from '@/app/api/bookings/route'
import { PUT } from '@/app/api/bookings/[id]/route'
import { POST as confirmWithCredits } from '@/app/api/bookings/[id]/confirm-with-credits/route'

jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: process.env.BOOKING_RACE_USER_ID, email: 'booking-race@example.test', name: 'Race Test' } }),
}))
jest.mock('@/lib/activity-log', () => ({ logActivity: jest.fn() }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { isEnabled: () => false } }))

let userId: string
let healerUserId: string
let healerId: string
let serviceId: string
let previousTestMode: string | undefined

function day(offset: number) {
  return clinicDate(new Date(Date.now() + (30 + offset) * 86400000))
}
function slot(offset: number, time: string) {
  return clinicSlotInstant(day(offset), time).toISOString()
}
function create(offset: number, time: string) {
  return POST(makeNextRequest('http://localhost/api/bookings', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ healerId, serviceId, scheduledAt: slot(offset, time) }),
  }))
}
function reschedule(id: string, offset: number, time: string) {
  return PUT(makeNextRequest(`http://localhost/api/bookings/${id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scheduledAt: slot(offset, time) }),
  }), { params: Promise.resolve({ id }) })
}
async function created(offset: number, time: string) {
  const response = await create(offset, time)
  expect(response.status).toBe(201)
  return (await response.json()).data.id as string
}

beforeAll(async () => {
  previousTestMode = process.env.TEST_MODE
  delete process.env.TEST_MODE
  const user = await prisma.user.create({ data: { email: `booking-race-${randomUUID()}@example.test`, password: 'unused', role: 'USER' } })
  userId = user.id
  process.env.BOOKING_RACE_USER_ID = userId
  const healerUser = await prisma.user.create({ data: { email: `healer-race-${randomUUID()}@example.test`, password: 'unused', role: 'HEALER' } })
  healerUserId = healerUser.id
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const availability = Object.fromEntries(days.map(d => [d, { start: '09:00', end: '20:00' }]))
  healerId = (await prisma.healer.create({ data: { userId: healerUserId, availability } })).id
  serviceId = (await prisma.service.create({ data: {
    slug: `booking-race-${randomUUID()}`, name: 'Race Test', description: 'Test', category: 'Test', price: 100, duration: 90,
  } })).id
})

afterAll(async () => {
  if (previousTestMode === undefined) delete process.env.TEST_MODE
  else process.env.TEST_MODE = previousTestMode
  delete process.env.BOOKING_RACE_USER_ID
  if (userId) await prisma.user.delete({ where: { id: userId } })
  if (healerUserId) await prisma.user.delete({ where: { id: healerUserId } })
  if (serviceId) await prisma.service.delete({ where: { id: serviceId } })
  await prisma.$disconnect()
})

test('concurrent overlapping creates yield exactly one reservation, including in test mode', async () => {
  process.env.TEST_MODE = '1'
  try {
    const responses = await Promise.all([create(1, '10:00'), create(1, '10:30')])
    expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([201, 409])
    expect(await prisma.booking.count({ where: { healerId, scheduledAt: { gte: new Date(slot(1, '09:00')), lt: new Date(slot(1, '13:00')) } } })).toBe(1)
  } finally {
    delete process.env.TEST_MODE
  }
})

test('a creation and reschedule cannot reserve overlapping intervals concurrently', async () => {
  const id = await created(2, '10:00')
  const responses = await Promise.all([reschedule(id, 2, '13:00'), create(2, '13:30')])
  expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([200, 409])
  const bookings = await prisma.booking.findMany({ where: { healerId, scheduledAt: { gte: new Date(slot(2, '13:00')), lt: new Date(slot(2, '15:00')) } } })
  expect(bookings).toHaveLength(1)
})

test('two reschedules competing for a slot leave only one booking there', async () => {
  const first = await created(3, '10:00')
  const second = await created(3, '15:00')
  const responses = await Promise.all([reschedule(first, 3, '12:00'), reschedule(second, 3, '12:00')])
  expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([200, 409])
  expect(await prisma.booking.count({ where: { healerId, scheduledAt: new Date(slot(3, '12:00')), status: 'RESCHEDULED' } })).toBe(1)
  expect((await create(3, '12:30')).status).toBe(409)
})

test('rescheduling excludes its own original interval and retains its booked duration', async () => {
  const id = await created(4, '10:00')
  await prisma.service.update({ where: { id: serviceId }, data: { duration: 30 } })
  try {
    expect((await reschedule(id, 4, '10:30')).status).toBe(200)
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id } })
    expect(booking.durationMin).toBe(90)
    expect((await create(4, '11:30')).status).toBe(409)
  } finally {
    await prisma.service.update({ where: { id: serviceId }, data: { duration: 90 } })
  }
})

test('a cancelled or completed booking cannot be revived by rescheduling', async () => {
  const id = await created(5, '10:00')
  for (const status of ['CANCELLED', 'COMPLETED'] as const) {
    await prisma.booking.update({ where: { id }, data: { status } })
    expect((await reschedule(id, 5, '12:00')).status).toBe(409)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe(status)
  }
})

test('concurrent credit confirmations spend only one credit for one booking', async () => {
  const id = await created(6, '10:00')
  await prisma.user.update({ where: { id: userId }, data: { vip: true, freeSessionCredits: 2 } })
  try {
    const confirm = () => confirmWithCredits(new Request('http://localhost/confirm', { method: 'POST' }), { params: Promise.resolve({ id }) })
    const responses = await Promise.all([confirm(), confirm()])
    expect(responses.map(r => r.status).sort((a, b) => a - b)).toEqual([200, 400])
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).freeSessionCredits).toBe(1)
    expect((await prisma.booking.findUniqueOrThrow({ where: { id } })).status).toBe('CONFIRMED')
    expect(await prisma.payment.count({ where: { bookingId: id } })).toBe(1)
  } finally {
    await prisma.user.update({ where: { id: userId }, data: { vip: false, freeSessionCredits: 0 } })
  }
})
