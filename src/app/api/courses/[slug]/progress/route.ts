import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'
import { logActivity } from '@/lib/activity-log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ProgressSchema = z.object({
  // The stored progress is one greater than the lesson order, in a PostgreSQL Int.
  lessonOrder: z.number().int().min(0).max(2147483646),
})

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const parsed = ProgressSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const course = await prisma.course.findFirst({
      where: { OR: [{ id: slug }, { slug }], isActive: true },
      include: { lessons: { select: { order: true } } },
    })
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

    const enrollment = await prisma.courseEnrollment.findFirst({
      where: { userId: session.user.id, courseId: course.id, status: { in: ['active', 'completed'] } },
    })
    if (!enrollment) return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })

    if (!course.lessons.some(lesson => lesson.order === parsed.data.lessonOrder)) {
      return NextResponse.json({ error: 'Invalid lesson order' }, { status: 400 })
    }

    // Retain the existing representation: progress is greater than a completed lesson's order.
    const newProgress = Math.max(enrollment.progress, parsed.data.lessonOrder + 1)
    const isCompleted = course.lessons.every(lesson => newProgress > lesson.order)

    // Only advance the saved position. Concurrent or delayed requests cannot move it backwards.
    const changed = await prisma.courseEnrollment.updateMany({
      where: { id: enrollment.id, progress: { lt: newProgress }, status: { in: ['active', 'completed'] } },
      data: {
        progress: newProgress,
        ...(isCompleted ? { status: 'completed' } : {}),
      },
    })
    const updated = await prisma.courseEnrollment.findUnique({ where: { id: enrollment.id } })
    if (!updated || !['active', 'completed'].includes(updated.status)) {
      return NextResponse.json({ error: 'Enrollment no longer active' }, { status: 409 })
    }

    if (changed.count > 0) {
      logActivity({ userId: session.user.id, action: isCompleted && enrollment.status !== 'completed' ? 'course_completed' : 'lesson_completed', entityType: 'course', entityId: course.id, metadata: { progress: updated.progress, lessonOrder: parsed.data.lessonOrder } })
    }
    return NextResponse.json({ progress: updated.progress, status: updated.status })
  } catch (err) {
    console.error('[courses][progress][error]', err)
    return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
  }
}
