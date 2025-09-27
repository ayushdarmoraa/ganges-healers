import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, context: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await context.params
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } })
    if (!payment) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (payment.userId && payment.userId !== session.user.id && session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const invoice = await prisma.invoice.findUnique({ where: { paymentId: payment.id } })
    if (!invoice) return NextResponse.json({ error: 'Invoice missing' }, { status: 404 })
    return NextResponse.json({ invoice })
  } catch (err) {
    console.error('[invoices][get][error]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
