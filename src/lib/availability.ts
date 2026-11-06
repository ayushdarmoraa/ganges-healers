import { isTestMode } from '@/lib/test-mode'
// lib/availability.ts
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { BOOKING_TIME_ZONE, clinicSlotInstant } from '@/lib/bookings/time'
import { fitsWorkingWindow, readWeeklyAvailability, workingWindowSlots, type WeekDay } from '@/lib/bookings/availability-rules'

export interface TimeSlot {
  time: string // "HH:MM" format
  available: boolean
  bookingId?: string
}

export interface AvailabilityDay {
  date: string // YYYY-MM-DD
  slots: TimeSlot[]
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
async function overlappingBookings(client: Prisma.TransactionClient, healerId: string, start: Date, end: Date, excludeId: string | null = null, excludeProgramSessionId: string | null = null) {
  return client.$queryRaw<Array<{ id: string; scheduledAt: Date; durationMin: number }>>`
    SELECT id, "scheduledAt", "durationMin" FROM "Booking"
    WHERE "healerId" = ${healerId}
      AND status IN ('PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED')
      AND "scheduledAt" < (${end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND "scheduledAt" + "durationMin" * INTERVAL '1 minute' > (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND (${excludeId}::text IS NULL OR id <> ${excludeId}::text)
    UNION ALL
    SELECT s.id, s."scheduledAt", s."durationMin" FROM "ProgramSession" s
    JOIN "ProgramEnrollment" e ON e.id = s."enrollmentId"
    WHERE s."healerId" = ${healerId}
      AND s.status = 'SCHEDULED' AND e.status IN ('active', 'paused')
      AND s."scheduledAt" < (${end.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND s."scheduledAt" + s."durationMin" * INTERVAL '1 minute' > (${start.toISOString()}::timestamptz AT TIME ZONE 'UTC')
      AND (${excludeProgramSessionId}::text IS NULL OR s.id <> ${excludeProgramSessionId}::text)
  `
}

/**
 * Get healer availability for a specific date
 */
export async function getHealerAvailability(
  healerId: string,
  date: string, // YYYY-MM-DD in India
  durationMin = 60,
  excludeBookingId?: string,
  excludeProgramSessionId?: string
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
  const window = readWeeklyAvailability(healer.availability)?.[dayName as WeekDay]
  const allSlots = workingWindowSlots(window)
  if (!allSlots.length || !Number.isSafeInteger(durationMin) || durationMin <= 0) return { date, slots: [] }
  
  // Get existing bookings for this healer on this date
  const startOfDay = new Date(date + 'T00:00:00+05:30')
  const endOfDay = new Date(startOfDay.getTime() + 86400000)
  const existingBookings = await overlappingBookings(prisma, healerId, startOfDay, endOfDay, excludeBookingId, excludeProgramSessionId)

  // Check each slot
  const now = Date.now()
  const slots: TimeSlot[] = allSlots.map(time => {
    // Check if time is within healer's availability
    const inAvailability = fitsWorkingWindow(window, time, durationMin)
    
    if (!inAvailability) {
      return {
        time,
        available: false
      }
    }
    
    // Compare the same absolute instant used when creating a booking.
    const instant = clinicSlotInstant(date, time)
    const conflict = instant.getTime() <= now || hasBookingConflict(instant, durationMin, existingBookings)
    
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
async function validateReservationSlot(
  healerId: string,
  serviceId: string | null,
  scheduledAt: Date,
  options: { client?: Prisma.TransactionClient; excludeBookingId?: string; excludeProgramSessionId?: string; durationMin?: number; strict?: boolean } = {}
): Promise<{ valid: boolean; error?: string }> {
  const isTest = !options.strict && isTestMode()
  const client = options.client ?? prisma
  // Check if time is in future
  const now = new Date()
  if (!Number.isFinite(scheduledAt.getTime())) return { valid: false, error: 'Invalid booking time' }
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
  
  const service = serviceId ? await client.service.findUnique({
    where: { id: serviceId },
    select: { duration: true, isActive: true }
  }) : null
  
  if (!healer || !healer.isActive) {
    return { valid: false, error: 'Healer not found or inactive' }
  }
  
  if (serviceId && (!service || !service.isActive)) {
    return { valid: false, error: 'Service not found or inactive' }
  }
  
  // Check healer availability for this day/time
  const durationMin = options.durationMin ?? service?.duration ?? 0
  if (!Number.isSafeInteger(durationMin) || durationMin <= 0) return { valid: false, error: 'Invalid service duration' }
  
  const window = readWeeklyAvailability(healer.availability)?.[dayName as WeekDay]
  if (!isTest && !fitsWorkingWindow(window, timeStr, durationMin)) {
    return { valid: false, error: 'Healer not available at this time' }
  }
  
  const existingBookings = await overlappingBookings(client, healerId, scheduledAt,
    new Date(scheduledAt.getTime() + durationMin * 60000), options.excludeBookingId, options.excludeProgramSessionId)
  const conflict = hasBookingConflict(scheduledAt, durationMin, existingBookings)
  // Never bypass the overlap check, even in TEST_MODE: it is an integrity rule.
  if (conflict) {
    return { valid: false, error: 'Time slot not available' }
  }
  
  return { valid: true }
}

/** Keep the existing service-priced booking validation contract. */
export function validateBookingSlot(healerId: string, serviceId: string, scheduledAt: Date,
  options: { client?: Prisma.TransactionClient; excludeBookingId?: string; durationMin?: number } = {}) {
  return validateReservationSlot(healerId, serviceId, scheduledAt, options)
}

/** Program sessions use their paid enrollment duration, never an arbitrary service price. */
export function validateProgramSessionSlot(healerId: string, scheduledAt: Date, durationMin: number,
  options: { client?: Prisma.TransactionClient; excludeProgramSessionId?: string } = {}) {
  return validateReservationSlot(healerId, null, scheduledAt, { ...options, durationMin, strict: true })
}
