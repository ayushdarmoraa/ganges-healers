import { NextRequest, NextResponse } from 'next/server'
import { getHealerBySlug } from '@/lib/healers/queries'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const healer = await getHealerBySlug(slug)
    if (!healer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(healer)
  } catch (e) {
    console.error('[healers][detail][error]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
