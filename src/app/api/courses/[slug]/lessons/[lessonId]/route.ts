import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; lessonId: string }> }
) {
  try {
    const { slug, lessonId } = await params
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const course = await prisma.course.findFirst({
      where: { OR: [{ id: slug }, { slug }] },
    })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    // Verify enrollment
    const enrollment = await prisma.courseEnrollment.findFirst({
      where: { userId: session.user.id, courseId: course.id, status: { in: ['active', 'completed'] } },
    })
    if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })

    const lesson = await prisma.courseLesson.findFirst({
      where: { id: lessonId, courseId: course.id },
    })
    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

    // Get all lesson IDs for navigation
    const allLessons = await prisma.courseLesson.findMany({
      where: { courseId: course.id },
      orderBy: { order: 'asc' },
      select: { id: true, title: true, order: true },
    })

    return NextResponse.json({ lesson, allLessons, enrollment: { progress: enrollment.progress } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    console.error('[courses][lesson][error]', err)
    return NextResponse.json({ error: 'Failed to fetch lesson' }, { status: 500 })
  }
}
