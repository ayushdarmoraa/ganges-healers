import { NextRequest } from 'next/server'
import { GET } from '@/app/api/availability/route'

jest.mock('@/lib/prisma', () => ({ prisma: { service: { findUnique: jest.fn() }, booking: { findFirst: jest.fn() } } }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/availability', () => ({ getHealerAvailability: jest.fn() }))

const prisma = jest.requireMock<{ prisma: { service: { findUnique: jest.Mock }; booking: { findFirst: jest.Mock } } }>('@/lib/prisma').prisma
const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const availability = jest.requireMock<{ getHealerAvailability: jest.Mock }>('@/lib/availability').getHealerAvailability
const request = (params: string) => new NextRequest(`http://localhost/api/availability?${params}`)

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-01-01T20:00:00Z')) // Jan 2 in India
  jest.clearAllMocks()
  availability.mockResolvedValue({ date: '2026-01-02', slots: [] })
})
afterEach(() => jest.useRealTimers())

test('uses India calendar dates instead of the server timezone', async () => {
  expect((await GET(request('healerId=h&date=2026-01-01'))).status).toBe(400)
  expect((await GET(request('healerId=h&date=2026-01-02'))).status).toBe(200)
  expect(availability).toHaveBeenCalledWith('h', '2026-01-02', 60, undefined)
})

test('passes an active service duration to the slot calculation', async () => {
  prisma.service.findUnique.mockResolvedValue({ isActive: true, duration: 90 })
  expect((await GET(request('healerId=h&date=2026-01-02&serviceId=s'))).status).toBe(200)
  expect(availability).toHaveBeenCalledWith('h', '2026-01-02', 90, undefined)
})

test('rescheduling availability requires the owner and uses the booked duration', async () => {
  auth.mockResolvedValue({ user: { id: 'owner' } })
  prisma.booking.findFirst.mockResolvedValue({ id: 'b', serviceId: 's', status: 'CONFIRMED', durationMin: 90, service: { isActive: true } })
  expect((await GET(request('healerId=h&date=2026-01-02&bookingId=b'))).status).toBe(200)
  expect(prisma.booking.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b', userId: 'owner', healerId: 'h' } }))
  expect(availability).toHaveBeenCalledWith('h', '2026-01-02', 90, 'b')
})

test('cannot exclude another user’s booking or a cancelled booking', async () => {
  auth.mockResolvedValueOnce(null)
  expect((await GET(request('healerId=h&date=2026-01-02&bookingId=b'))).status).toBe(401)
  auth.mockResolvedValue({ user: { id: 'other' } })
  prisma.booking.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'b', status: 'CANCELLED', durationMin: 60, service: { isActive: true } })
  expect((await GET(request('healerId=h&date=2026-01-02&bookingId=b'))).status).toBe(404)
  expect((await GET(request('healerId=h&date=2026-01-02&bookingId=b'))).status).toBe(409)
  expect(availability).not.toHaveBeenCalled()
})

test('rejects invalid dates and missing or inactive services', async () => {
  expect((await GET(request('healerId=h&date=2026-02-30'))).status).toBe(400)
  prisma.service.findUnique.mockResolvedValue({ isActive: false, duration: 60 })
  expect((await GET(request('healerId=h&date=2026-01-02&serviceId=s'))).status).toBe(404)
  expect(availability).not.toHaveBeenCalled()
})
