import { NextResponse } from 'next/server'
import { readCourseForViewer } from '@/lib/courses/access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params

    const course = await readCourseForViewer(slug)

    if (!course) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
    }

    return NextResponse.json(course, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[courses][detail][error]', err)
    return NextResponse.json({ error: 'Failed to fetch course' }, { status: 500 })
  }
}
