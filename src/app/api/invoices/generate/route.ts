import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { generateInvoiceForPayment } from '@/lib/invoices/generate'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BodySchema = z.object({ paymentId: z.string().min(10), force: z.boolean().optional() })

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const json = await req.json()
    const parsed = BodySchema.safeParse(json)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    const { paymentId, force } = parsed.data
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { user: true } })
    if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (payment.userId && payment.userId !== session.user.id && session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const result = await generateInvoiceForPayment({ paymentId, force, sendEmail: false })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[invoices][generate][error]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
