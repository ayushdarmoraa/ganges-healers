import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { CourseAdminError, changeManagedCourse, createManagedCourse, listManagedCourses } from '@/lib/courses/admin'
import { courseAdminQuerySchema, courseVersionSchema, createCourseSchema, updateCourseSchema } from '@/lib/courses/admin-schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
function failure(error: unknown) {
  if (error instanceof CourseAdminError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers })
  const status = error && typeof error === 'object' && 'status' in error ? error.status : undefined
  if (status === 401 || status === 403) return NextResponse.json({ error: 'Forbidden' }, { status, headers })
  console.error('[courses][admin][error]', { type: error instanceof Error ? error.name : 'unknown' })
  return NextResponse.json({ error: 'Course management is temporarily unavailable' }, { status: 500, headers })
}
export async function GET(request: NextRequest) {
  try {
    await requireCurrentAdmin()
    const parsed = courseAdminQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid course filters' }, { status: 400, headers })
    return NextResponse.json({ success: true, ...await listManagedCourses(parsed.data) }, { headers })
  } catch (error) { return failure(error) }
}
async function write(request: NextRequest, method: 'POST' | 'PATCH' | 'DELETE') {
  try {
    const actor = await requireCurrentAdmin()
    let body: unknown
    try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers }) }
    if (method === 'POST') {
      const parsed = createCourseSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the course fields' }, { status: 400, headers })
      return NextResponse.json({ success: true, ...await createManagedCourse(actor.id, parsed.data) }, { status: 201, headers })
    }
    if (method === 'DELETE') {
      const parsed = courseVersionSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ error: 'The saved course version is required' }, { status: 400, headers })
      return NextResponse.json({ success: true, ...await changeManagedCourse(actor.id, { ...parsed.data, change: { action: 'archive' } }, true) }, { headers })
    }
    const parsed = updateCourseSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Valid changes and the saved version are required' }, { status: 400, headers })
    return NextResponse.json({ success: true, ...await changeManagedCourse(actor.id, parsed.data) }, { headers })
  } catch (error) { return failure(error) }
}
export const POST = (request: NextRequest) => write(request, 'POST')
export const PATCH = (request: NextRequest) => write(request, 'PATCH')
export const DELETE = (request: NextRequest) => write(request, 'DELETE')
