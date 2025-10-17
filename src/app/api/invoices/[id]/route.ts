// src/app/api/invoices/[id]/route.ts
import { NextResponse } from 'next/server'
import { resolveInvoiceUrl } from '@/lib/invoices/resolve'

export const dynamic = 'force-dynamic'

type ParamsObj = { id: string }
function isPromise<T>(v: unknown): v is Promise<T> {
  return typeof (v as { then?: unknown })?.then === 'function'
}

export async function GET(
  _req: Request,
  ctx: { params: ParamsObj | Promise<ParamsObj> }
) {
  const raw = ctx.params
  const id = isPromise<ParamsObj>(raw) ? (await raw).id : (raw as ParamsObj)?.id
  const url = await resolveInvoiceUrl(id)
  if (!url) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Public route contract: 302 redirect to the resolved PDF URL
  return NextResponse.redirect(url, 302)
}
