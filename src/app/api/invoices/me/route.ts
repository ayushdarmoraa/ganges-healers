import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const invoices = await prisma.invoice.findMany({
      where: { payment: { userId: session.user.id } },
      orderBy: { issuedAt: 'desc' },
      take: 50
    })
    return NextResponse.json({ invoices })
  } catch (err) {
    console.error('[invoices][me][error]', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
