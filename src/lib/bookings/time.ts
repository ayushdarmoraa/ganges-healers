/** Booking availability and healer working hours are expressed in India time. */
export const BOOKING_TIME_ZONE = 'Asia/Kolkata'

export function clinicDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BOOKING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

/** Convert an availability date and HH:mm label to its absolute instant. */
export function clinicSlotInstant(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+05:30`)
}
