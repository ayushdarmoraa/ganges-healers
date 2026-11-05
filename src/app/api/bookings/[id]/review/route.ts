import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { BookingError } from '@/lib/bookings/transactions'
import { submitBookingReview } from '@/lib/bookings/reviews'

const bodySchema = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(2000).optional() }).strict()

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = bodySchema.safeParse(await request.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'Choose a rating from 1 to 5 and keep your review within 2000 characters' }, { status: 400 })
    const { id } = await params
    const result = await submitBookingReview({ bookingId: id, userId: session.user.id, ...body.data })
    return NextResponse.json({ success: true, data: result.review, idempotent: result.idempotent }, { status: result.idempotent ? 200 : 201 })
  } catch (error) {
    if (error instanceof BookingError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('[booking][review][error]', { errorType: error instanceof Error ? error.name : 'unknown' })
    return NextResponse.json({ error: 'Could not save your review. Please try again.' }, { status: 500 })
  }
}
