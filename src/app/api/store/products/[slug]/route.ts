import { NextResponse } from 'next/server'
import { getProductBySlug } from '@/lib/store/queries'

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
  const product = await getProductBySlug(slug)
  if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(product)
}
