import { NextRequest } from 'next/server'
import { GET } from '@/app/api/availability/route'

jest.mock('@/lib/prisma', () => ({ prisma: { service: { findUnique: jest.fn() } } }))
jest.mock('@/lib/availability', () => ({ getHealerAvailability: jest.fn() }))

const prisma = jest.requireMock<{ prisma: { service: { findUnique: jest.Mock } } }>('@/lib/prisma').prisma
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
  expect(availability).toHaveBeenCalledWith('h', '2026-01-02', 60)
})

test('passes an active service duration to the slot calculation', async () => {
  prisma.service.findUnique.mockResolvedValue({ isActive: true, duration: 90 })
  expect((await GET(request('healerId=h&date=2026-01-02&serviceId=s'))).status).toBe(200)
  expect(availability).toHaveBeenCalledWith('h', '2026-01-02', 90)
})

test('rejects invalid dates and missing or inactive services', async () => {
  expect((await GET(request('healerId=h&date=2026-02-30'))).status).toBe(400)
  prisma.service.findUnique.mockResolvedValue({ isActive: false, duration: 60 })
  expect((await GET(request('healerId=h&date=2026-01-02&serviceId=s'))).status).toBe(404)
  expect(availability).not.toHaveBeenCalled()
})
