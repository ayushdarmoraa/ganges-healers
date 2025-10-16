// src/app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server'
import { resolveInvoiceUrl } from '@/lib/invoices/resolve'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const url = await resolveInvoiceUrl(params.id)
  if (!url) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Preserve “direct URL” contract: respond with the URL as plain text.
  return new Response(url, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
