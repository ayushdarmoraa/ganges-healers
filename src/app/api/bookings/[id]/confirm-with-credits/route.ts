import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { id } = await params

  try {
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.findUnique({ where: { id: session.user.id } })
      if (!user) throw new Error('USER_NOT_FOUND')
      if (!user.vip || (user.freeSessionCredits ?? 0) <= 0) throw new Error('NO_CREDITS')

      const booking = await tx.booking.findUnique({ where: { id } })
      if (!booking) throw new Error('BOOKING_NOT_FOUND')
      if (booking.userId !== user.id) throw new Error('FORBIDDEN')
      if (booking.status !== 'PENDING') throw new Error('INVALID_STATE')

      const confirmed = await tx.booking.updateMany({
        where: { id, userId: user.id, status: 'PENDING' },
        data: { status: 'CONFIRMED' },
      })
      if (confirmed.count !== 1) throw new Error('INVALID_STATE')
      const credit = await tx.user.updateMany({
        where: { id: user.id, vip: true, freeSessionCredits: { gt: 0 } },
        data: { freeSessionCredits: { decrement: 1 } },
      })
      if (credit.count !== 1) throw new Error('NO_CREDITS')

      await tx.payment.upsert({
        where: { bookingId: id },
        update: { gateway: 'vip_credit', status: 'success', amountPaise: 0 },
        create: { bookingId: id, gateway: 'vip_credit', status: 'success', amountPaise: 0 },
      })

      return true
    })

    return NextResponse.json({ ok: result })
  } catch (e: unknown) {
    const code = e instanceof Error ? e.message : 'UNKNOWN'
    const map: Record<string, number> = {
      USER_NOT_FOUND: 404,
      NO_CREDITS: 400,
      BOOKING_NOT_FOUND: 404,
      FORBIDDEN: 403,
      INVALID_STATE: 400,
    }
    return NextResponse.json({ error: code }, { status: map[code] ?? 500 })
  }
}
