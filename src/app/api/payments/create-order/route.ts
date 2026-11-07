import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { PaymentResourceError } from '@/lib/payments/resource'
import { createPaymentOrder } from '@/lib/payments/create-order'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BodySchema = z.object({
  amountPaise: z.number().int().positive().optional(),
  bookingId: z.string().cuid().optional(),
  type: z.enum(['SESSION','PROGRAM','MEMBERSHIP','STORE','COURSE']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = BodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    }
    const { amountPaise, bookingId, type, metadata } = parsed.data

    // Enforce mutual exclusivity: either bookingId OR type (generic). Not both.
    if ((bookingId && type) || (!bookingId && !type)) {
      return NextResponse.json({ error: 'Provide either bookingId OR type (generic payment), exclusively.' }, { status: 400 })
    }

    const input = { userId: session.user.id, type: bookingId ? 'SESSION' as const : type!, bookingId, metadata, amountPaise }
    return NextResponse.json(await createPaymentOrder(input))

  } catch (err) {
    if (err instanceof PaymentResourceError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[payments][create-order][error]', err)
    return NextResponse.json({ error: 'Failed to create order' }, { status: 500 })
  }
}
