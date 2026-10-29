import { isTestMode } from '@/lib/test-mode'
// lib/availability.ts
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { BOOKING_TIME_ZONE, clinicSlotInstant } from '@/lib/bookings/time'

export interface TimeSlot {
  time: string // "HH:MM" format
  available: boolean
  bookingId?: string
}

export interface AvailabilityDay {
  date: string // YYYY-MM-DD
  slots: TimeSlot[]
}

/**
 * Generate 30-minute time slots for a day
 * Default hours: 10:00 - 20:00 IST (20 slots)
 */
function generateDaySlots(startHour = 10, endHour = 20): string[] {
  const slots: string[] = []
  
  for (let hour = startHour; hour < endHour; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`)
    slots.push(`${hour.toString().padStart(2, '0')}:30`)
  }
  
  return slots
}

/**
 * Check if a time falls within healer's availability window
 */
interface DayWindow { start?: string; end?: string }
type AvailabilityShape = Record<string, DayWindow>

function isTimeInAvailability(
  time: string,
  dayName: string,
  availability: AvailabilityShape | null | undefined,
  durationMin = 60
): boolean {
  if (!availability || !availability[dayName.toLowerCase()]) {
    return false
  }
  
  const dayAvailability = availability[dayName.toLowerCase()]
  if (!dayAvailability.start || !dayAvailability.end) {
    return false
  }
  
  const timeMinutes = timeToMinutes(time)
  const startMinutes = timeToMinutes(dayAvailability.start)
  const endMinutes = timeToMinutes(dayAvailability.end)
  
  return timeMinutes >= startMinutes && timeMinutes + durationMin <= endMinutes
}

/**
 * Convert HH:MM to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

// Availability rules and displayed slot labels use the clinic's India timezone.
function clinicTime(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BOOKING_TIME_ZONE, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)?.value ?? ''
  return { day: value('weekday').toLowerCase(), time: `${value('hour')}:${value('minute')}` }
}

function hasBookingConflict(proposed: Date, durationMin: number, bookings: Array<{ scheduledAt: Date; durationMin: number }>) {
  const end = proposed.getTime() + durationMin * 60000
  return bookings.some(b => proposed.getTime() < b.scheduledAt.getTime() + b.durationMin * 60000 && end > b.scheduledAt.getTime())
}

// Check absolute intervals, including sessions starting on a previous day. This
// query uses the healer/start index without a duration-dependent lower bound.
async function overlappingBookings(client: Prisma.TransactionClient, healerId: string, start: Date, end: Date, excludeId: string | null = null) {
  return client.$queryRaw<Array<{ id: string; scheduledAt: Date; durationMin: number }>>`
    SELECT id, "scheduledAt", "durationMin" FROM "Booking"
    WHERE "healerId" = ${healerId}
      AND status IN ('PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED')
      AND "scheduledAt" < (${end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND "scheduledAt" + "durationMin" * INTERVAL '1 minute' > (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND (${excludeId}::text IS NULL OR id <> ${excludeId}::text)
  `
}

/**
 * Get healer availability for a specific date
 */
export async function getHealerAvailability(
  healerId: string,
  date: string, // YYYY-MM-DD in India
  durationMin = 60,
  excludeBookingId?: string
): Promise<AvailabilityDay> {
  // Get healer with availability rules
  const healer = await prisma.healer.findUnique({
    where: { id: healerId },
    select: {
      availability: true,
      isActive: true
    }
  })
  
  if (!healer || !healer.isActive) {
    return {
      date,
      slots: []
    }
  }
  
  // Parse date and get day name
  const targetDate = new Date(date + 'T00:00:00+05:30')
  const dayName = clinicTime(targetDate).day
  
  // Generate all possible slots
  const allSlots = generateDaySlots()
  
  // Get existing bookings for this healer on this date
  const startOfDay = new Date(date + 'T00:00:00+05:30')
  const endOfDay = new Date(startOfDay.getTime() + 86400000)
  const existingBookings = await overlappingBookings(prisma, healerId, startOfDay, endOfDay, excludeBookingId)

  // Check each slot
  const rawAvail = healer.availability as unknown
  const availObj: AvailabilityShape | null = (typeof rawAvail === 'object' && rawAvail !== null) ? rawAvail as AvailabilityShape : null

  const slots: TimeSlot[] = allSlots.map(time => {
    // Check if time is within healer's availability
    const inAvailability = isTimeInAvailability(time, dayName, availObj, durationMin)
    
    if (!inAvailability) {
      return {
        time,
        available: false
      }
    }
    
    // Compare the same absolute instant used when creating a booking.
    const conflict = hasBookingConflict(clinicSlotInstant(date, time), durationMin, existingBookings)
    
    return {
      time,
      available: !conflict
    }
  })
  
  return {
    date,
    slots
  }
}

/**
 * Validate booking request
 */
export async function validateBookingSlot(
  healerId: string,
  serviceId: string,
  scheduledAt: Date,
  options: { client?: Prisma.TransactionClient; excludeBookingId?: string; durationMin?: number } = {}
): Promise<{ valid: boolean; error?: string }> {
  const isTest = isTestMode()
  const client = options.client ?? prisma
  // Check if time is in future
  const now = new Date()
  if (!isTest && scheduledAt <= now) {
    return { valid: false, error: 'Booking time must be in the future' }
  }
  
  // Check if time is aligned to 30-min slots
  const { time: timeStr, day: dayName } = clinicTime(scheduledAt)
  const minutes = Number(timeStr.split(':')[1])
  if (!isTest && ((minutes !== 0 && minutes !== 30) || scheduledAt.getSeconds() !== 0 || scheduledAt.getMilliseconds() !== 0)) {
    return { valid: false, error: 'Booking time must be aligned to 30-minute slots' }
  }
  
  // Get healer and service
  const healer = await client.healer.findUnique({
    where: { id: healerId },
    select: { availability: true, isActive: true }
  })
  
  const service = await client.service.findUnique({
    where: { id: serviceId },
    select: { duration: true, isActive: true }
  })
  
  if (!healer || !healer.isActive) {
    return { valid: false, error: 'Healer not found or inactive' }
  }
  
  if (!service || !service.isActive) {
    return { valid: false, error: 'Service not found or inactive' }
  }
  
  // Check healer availability for this day/time
  const durationMin = options.durationMin ?? service.duration
  if (!Number.isSafeInteger(durationMin) || durationMin <= 0) return { valid: false, error: 'Invalid service duration' }
  
  const healerAvailRaw = healer.availability as unknown
  const healerAvail: AvailabilityShape | null = (typeof healerAvailRaw === 'object' && healerAvailRaw !== null) ? healerAvailRaw as AvailabilityShape : null
  if (!isTest && !isTimeInAvailability(timeStr, dayName, healerAvail, durationMin)) {
    return { valid: false, error: 'Healer not available at this time' }
  }
  
  const existingBookings = await overlappingBookings(client, healerId, scheduledAt,
    new Date(scheduledAt.getTime() + durationMin * 60000), options.excludeBookingId)
  const conflict = hasBookingConflict(scheduledAt, durationMin, existingBookings)
  // Never bypass the overlap check, even in TEST_MODE: it is an integrity rule.
  if (conflict) {
    return { valid: false, error: 'Time slot not available' }
  }
  
  return { valid: true }
}
