import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const enrollments = await prisma.courseEnrollment.findMany({
      where: { userId: session.user.id, status: { in: ['active', 'completed'] } },
      include: {
        course: {
          include: {
            _count: { select: { lessons: true } },
            lessons: { select: { order: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(enrollments.map(enrollment => {
      const { lessons, ...course } = enrollment.course
      return {
        ...enrollment,
        course,
        completedLessons: lessons.filter(lesson => enrollment.progress > lesson.order).length,
      }
    }))
  } catch (err) {
    console.error('[courses][enrollments][error]', err)
    return NextResponse.json({ error: 'Failed to fetch enrollments' }, { status: 500 })
  }
}
