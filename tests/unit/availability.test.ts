import FakeTimers from '@sinonjs/fake-timers'

// ------------------ Prisma Mock (before SUT import) ------------------
interface BookingRecord { id: string; scheduledAt: Date; durationMin: number }
interface DayWindow { start: string; end: string }
type AvailabilityMap = Record<string, DayWindow | undefined>

const bookings: BookingRecord[] = []
const availability: AvailabilityMap = {
  monday: { start: '10:00', end: '20:00' },
  tuesday: { start: '10:00', end: '20:00' },
  wednesday: { start: '10:00', end: '20:00' },
  thursday: { start: '10:00', end: '20:00' },
  friday: { start: '10:00', end: '20:00' },
  saturday: { start: '10:00', end: '20:00' },
  sunday: { start: '10:00', end: '20:00' },
}

jest.mock('@/lib/prisma', () => ({
  prisma: {
    healer: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'inactive') return { availability, isActive: false }
        if (where.id === 'no-availability') return { availability: {}, isActive: true }
        if (where.id === 'no-healer') return null
        return { availability, isActive: true }
      }),
    },
    service: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id === 'service-inactive') return { duration: 60, isActive: false }
        if (where.id === 'service-30') return { duration: 30, isActive: true }
        return { duration: 60, isActive: true }
      }),
    },
    booking: {
      findMany: jest.fn(async (args: { where?: { scheduledAt?: { gte?: Date; lte?: Date } } }) => {
        const gte = args.where?.scheduledAt?.gte
        const lte = args.where?.scheduledAt?.lte
        if (gte && lte) return bookings.filter(b => b.scheduledAt >= gte && b.scheduledAt <= lte)
        if (gte && !lte) return bookings.filter(b => b.scheduledAt >= gte)
        return bookings
      })
    }
  }
}))

import { getHealerAvailability, validateBookingSlot } from '@/lib/availability'

// ------------------ Helpers ------------------
function addBooking(iso: string, durationMin = 60) {
  bookings.push({ id: 'b' + bookings.length, scheduledAt: new Date(iso), durationMin })
}

let clock: FakeTimers.InstalledClock
beforeAll(() => {
  // Frozen time: 2025-09-25 09:00 IST (03:30Z)
  clock = FakeTimers.install({ now: new Date('2025-09-25T03:30:00.000Z') })
})
afterAll(() => clock.uninstall())
beforeEach(() => { bookings.splice(0, bookings.length); jest.clearAllMocks() })

// ------------------ Tests ------------------
describe('getHealerAvailability', () => {
  it('produces 20 contiguous 30-min slots from 10:00..19:30', async () => {
    const res = await getHealerAvailability('healer-1', '2025-09-29')
    expect(res.slots).toHaveLength(20)
    expect(res.slots[0].time).toBe('10:00')
    expect(res.slots.at(-1)?.time).toBe('19:30')
    expect(res.slots.filter(s => !s.available)).toHaveLength(0)
  })

  it('no availability => all slots marked unavailable', async () => {
    const res = await getHealerAvailability('no-availability', '2025-09-29')
    expect(res.slots).toHaveLength(20)
    expect(res.slots.every(s => !s.available)).toBe(true)
  })

  it('inactive healer returns []', async () => {
    const res = await getHealerAvailability('inactive', '2025-09-29')
    expect(res.slots).toEqual([])
  })

  it('conflicting booking marks slot unavailable', async () => {
    // Use local time string (no Z) to align with slot generation independent of system TZ
    addBooking('2025-09-29T10:30:00')
    const res = await getHealerAvailability('healer-1', '2025-09-29')
    const tenThirty = res.slots.find(s => s.time === '10:30')
    expect(tenThirty?.available).toBe(false)
  })

  it('boundary slots exist', async () => {
    const res = await getHealerAvailability('healer-1', '2025-09-30')
    expect(res.slots[0].time).toBe('10:00')
    expect(res.slots.at(-1)?.time).toBe('19:30')
  })
})

describe('validateBookingSlot', () => {
  it('rejects past time', async () => {
    const past = new Date('2025-09-25T02:30:00.000Z') // 08:00 IST
    const res = await validateBookingSlot('healer-1', 'service-60', past)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/future/i)
  })

  it('rejects misaligned time (10:10 IST)', async () => {
    const misaligned = new Date('2025-09-29T04:40:00.000Z') // 10:10 IST
    const res = await validateBookingSlot('healer-1', 'service-60', misaligned)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/30-minute/i)
  })

  it('detects conflict with existing booking', async () => {
    addBooking('2025-09-29T12:00:00')
    const conflict = new Date('2025-09-29T12:00:00')
    const res = await validateBookingSlot('healer-1', 'service-60', conflict)
    expect(res.valid).toBe(false)
    expect(res.error).toMatch(/not available/i)
  })

  it('accepts aligned future free slot', async () => {
    const future = new Date('2025-09-29T10:00:00')
    const res = await validateBookingSlot('healer-1', 'service-60', future)
    expect(res.valid).toBe(true)
  })
})
