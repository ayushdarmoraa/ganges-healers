import { NextRequest, NextResponse } from 'next/server'
import { getProgramBySlug } from '@/lib/programs/queries'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const program = await getProgramBySlug(slug)
    if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(program)
  } catch (e) {
    console.error('[programs][detail][error]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
