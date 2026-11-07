import type { Prisma } from '@prisma/client'
import { lockTransaction } from '@/lib/db/locks'

/** Booking failures retain the route's existing public error and status. */
export class BookingError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'BookingError'
  }
}

/** Lock the healer before rereading/mutating an owned booking in this transaction. */
export async function lockOwnedBooking(client: Prisma.TransactionClient, id: string, userId: string) {
  const booking = await client.booking.findFirst({ where: { id, userId }, select: { healerId: true } })
  if (!booking) throw new BookingError('Booking not found', 404)
  await lockTransaction(client, 'healer', booking.healerId)
  return booking.healerId
}
