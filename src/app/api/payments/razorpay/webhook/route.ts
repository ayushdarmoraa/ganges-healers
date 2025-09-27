import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { generateInvoiceForPayment } from '@/lib/invoices/generate'
import type { Prisma } from '@prisma/client'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET!
  const bodyText = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''

  const expected = crypto.createHmac('sha256', webhookSecret).update(bodyText).digest('hex')
  if (expected !== signature) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(bodyText)
  const event = payload.event

  if (event === 'payment.captured') {
    const payment = payload.payload.payment.entity
    const notes = payment.notes || {}
    const bookingId = notes.bookingId as string | undefined

    if (!bookingId) {
      return NextResponse.json({ ok: true, ignored: true })
    }

  let savedPaymentId: string | null = null
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.payment.findUnique({ where: { bookingId } })
      if (!existing) {
        const created = await tx.payment.create({
          data: {
            bookingId,
            gateway: 'razorpay',
            paymentId: payment.id,
            orderId: payment.order_id,
            status: 'success',
            amountPaise: payment.amount,
          },
        })
        savedPaymentId = created.id
      } else {
        const updated = await tx.payment.update({
          where: { bookingId },
          data: {
            paymentId: payment.id,
            orderId: payment.order_id,
            status: 'success',
            amountPaise: payment.amount,
          },
        })
        savedPaymentId = updated.id
      }
      await tx.booking.update({ where: { id: bookingId }, data: { status: 'CONFIRMED' } })
    })

    if (savedPaymentId) {
      generateInvoiceForPayment({ paymentId: savedPaymentId }).catch(e => console.warn('[payments][webhook][invoice_failed]', { paymentId: savedPaymentId, error: (e as Error).message }))
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok: true, ignored: true })
}
