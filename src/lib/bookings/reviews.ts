import { prisma } from '@/lib/prisma'
import { BookingError, lockOwnedBooking } from '@/lib/bookings/transactions'

/** One immutable, owner-bound review per completed session; serialize rating updates with booking writers. */
export async function submitBookingReview(input: { bookingId: string; userId: string; rating: number; comment?: string }) {
  return prisma.$transaction(async tx => {
    await lockOwnedBooking(tx, input.bookingId, input.userId)
    const booking = await tx.booking.findFirst({
      where: { id: input.bookingId, userId: input.userId },
      select: {
        id: true, userId: true, healerId: true, serviceId: true, status: true, scheduledAt: true, durationMin: true,
        healer: { select: { userId: true } },
        review: { select: { id: true, rating: true, comment: true, createdAt: true } },
      },
    })
    if (!booking) throw new BookingError('Booking not found', 404)
    if (booking.healer.userId === input.userId) throw new BookingError('You cannot review your own session', 403)
    if (booking.status !== 'COMPLETED'
      || booking.scheduledAt.getTime() + booking.durationMin * 60000 > Date.now()) {
      throw new BookingError('Reviews are available after a completed session', 409)
    }
    const comment = input.comment?.trim() || null
    if (booking.review) {
      if (booking.review.rating !== input.rating || booking.review.comment !== comment) {
        throw new BookingError('A review already exists for this booking', 409)
      }
      return { review: booking.review, idempotent: true }
    }
    const review = await tx.review.create({
      data: { bookingId: booking.id, userId: booking.userId, healerId: booking.healerId, serviceId: booking.serviceId, rating: input.rating, comment },
      select: { id: true, rating: true, comment: true, createdAt: true },
    })
    const aggregate = await tx.review.aggregate({ where: { healerId: booking.healerId }, _avg: { rating: true } })
    await tx.healer.update({ where: { id: booking.healerId }, data: { rating: aggregate._avg.rating ?? 0 } })
    return { review, idempotent: false }
  }, { maxWait: 10000, timeout: 10000 })
}
