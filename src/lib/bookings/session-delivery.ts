/** Normalize links before storage or rendering; meeting URLs are never fetched by the server. */
export function safeMeetingLink(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || text.length > 2000 || /[\u0000-\u0020]/.test(text)) return null
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export interface DeliveryBooking {
  scheduledAt: string | Date; durationMin: number; status: string; pricePaise: number
  payment: { status: string; statusEnum?: string | null; amountPaise: number; gateway?: string } | null
}

/** UI capabilities mirror server checks, which always rerun on a fresh locked booking. */
export function healerBookingCapabilities(booking: DeliveryBooking, now = Date.now()) {
  const payment = booking.payment
  const captured = !!payment && (payment.statusEnum ? payment.statusEnum === 'SUCCESS' : payment.status.toLowerCase() === 'success')
  const credit = payment?.gateway === 'vip_credit'
  const validPrice = Number.isSafeInteger(booking.pricePaise) && booking.pricePaise >= 0
  const funded = captured && (credit ? payment.amountPaise === 0 : validPrice && payment.amountPaise === booking.pricePaise)
  const free = validPrice && booking.pricePaise === 0 && !payment
  const start = typeof booking.scheduledAt === 'string' ? Date.parse(booking.scheduledAt) : booking.scheduledAt.getTime()
  const validTime = Number.isFinite(start) && Number.isSafeInteger(booking.durationMin) && booking.durationMin > 0 && booking.durationMin <= 1440
  const end = start + booking.durationMin * 60000
  const confirmed = ['CONFIRMED', 'RESCHEDULED'].includes(booking.status)
  const cancellable = ['PENDING', 'SCHEDULED', 'CONFIRMED', 'RESCHEDULED'].includes(booking.status)
  return {
    canConfirm: ['PENDING', 'SCHEDULED'].includes(booking.status) && validTime && start > now && (funded || free),
    canComplete: confirmed && validTime && end <= now,
    canSetMeetingLink: confirmed && validTime && end > now,
    canCancel: cancellable && !captured && !credit,
    cancellationNeedsReview: cancellable && (captured || credit),
  }
}
