// lib/availability.ts
import { prisma } from '@/lib/prisma'

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
function isTimeInAvailability(
  time: string, 
  dayName: string, 
  availability: any
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
  
  return timeMinutes >= startMinutes && timeMinutes < endMinutes
}

/**
 * Convert HH:MM to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Get day name from date
 */
function getDayName(date: Date): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  return days[date.getDay()]
}

/**
 * Check if booking conflicts with existing booking (30min buffer)
 */
function hasBookingConflict(
  proposedTime: string,
  proposedDuration: number,
  existingBookings: Array<{ scheduledAt: Date; durationMin: number }>
): { conflicting: boolean; bookingId?: string } {
  const proposedStart = timeToMinutes(proposedTime)
  const proposedEnd = proposedStart + proposedDuration
  
  for (const booking of existingBookings) {
    const existingTime = booking.scheduledAt.toTimeString().slice(0, 5) // HH:MM
    const existingStart = timeToMinutes(existingTime)
    const existingEnd = existingStart + booking.durationMin
    
    // Check for overlap
    if (
      (proposedStart < existingEnd && proposedEnd > existingStart)
    ) {
      return { conflicting: true }
    }
  }
  
  return { conflicting: false }
}

/**
 * Get healer availability for a specific date
 */
export async function getHealerAvailability(
  healerId: string,
  date: string // YYYY-MM-DD
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
  const targetDate = new Date(date + 'T00:00:00.000Z')
  const dayName = getDayName(targetDate)
  
  // Generate all possible slots
  const allSlots = generateDaySlots()
  
  // Get existing bookings for this healer on this date
  const startOfDay = new Date(date + 'T00:00:00.000Z')
  const endOfDay = new Date(date + 'T23:59:59.999Z')
  
  const existingBookings = await prisma.booking.findMany({
    where: {
      healerId,
      scheduledAt: {
        gte: startOfDay,
        lte: endOfDay
      },
      status: {
        in: ['PENDING', 'SCHEDULED', 'CONFIRMED']
      }
    },
    select: {
      id: true,
      scheduledAt: true,
      durationMin: true
    }
  })
  
  // Check each slot
  const slots: TimeSlot[] = allSlots.map(time => {
    // Check if time is within healer's availability
    const inAvailability = isTimeInAvailability(time, dayName, healer.availability)
    
    if (!inAvailability) {
      return {
        time,
        available: false
      }
    }
    
    // Check for booking conflicts (assume 60min default duration)
    const conflict = hasBookingConflict(time, 60, existingBookings)
    
    return {
      time,
      available: !conflict.conflicting,
      bookingId: conflict.bookingId
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
  scheduledAt: Date
): Promise<{ valid: boolean; error?: string }> {
  // Check if time is in future
  const now = new Date()
  if (scheduledAt <= now) {
    return { valid: false, error: 'Booking time must be in the future' }
  }
  
  // Check if time is aligned to 30-min slots
  const minutes = scheduledAt.getMinutes()
  if (minutes !== 0 && minutes !== 30) {
    return { valid: false, error: 'Booking time must be aligned to 30-minute slots' }
  }
  
  // Get healer and service
  const healer = await prisma.healer.findUnique({
    where: { id: healerId },
    select: { availability: true, isActive: true }
  })
  
  const service = await prisma.service.findUnique({
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
  const dateStr = scheduledAt.toISOString().split('T')[0]
  const timeStr = scheduledAt.toTimeString().slice(0, 5)
  const dayName = getDayName(scheduledAt)
  
  if (!isTimeInAvailability(timeStr, dayName, healer.availability)) {
    return { valid: false, error: 'Healer not available at this time' }
  }
  
  // Check for conflicts
  const existingBookings = await prisma.booking.findMany({
    where: {
      healerId,
      scheduledAt: {
        gte: new Date(scheduledAt.getTime() - 2 * 60 * 60 * 1000), // 2h before
        lte: new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000)  // 2h after
      },
      status: {
        in: ['PENDING', 'SCHEDULED', 'CONFIRMED']
      }
    },
    select: {
      scheduledAt: true,
      durationMin: true
    }
  })
  
  const conflict = hasBookingConflict(timeStr, service.duration, existingBookings)
  if (conflict.conflicting) {
    return { valid: false, error: 'Time slot not available' }
  }
  
  return { valid: true }
}