// src/app/api/invoices/[id]/download/route.ts
import { NextResponse } from 'next/server'
import { resolveInvoiceUrl } from '@/lib/invoices/resolve'

export const runtime = 'nodejs'        // stream-friendly (valid values: 'edge' | 'nodejs')
export const dynamic = 'force-dynamic' // avoid caching during dev

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id
  const url = await resolveInvoiceUrl(id)
  if (!url) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 })
  }

  const upstream = await fetch(url, { cache: 'no-store' })
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'fetch-failed' }, { status: 502 })
  }

  const headers = new Headers()
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Disposition', `attachment; filename="invoice-${id}.pdf"`)

  return new Response(upstream.body, { status: 200, headers })
}
