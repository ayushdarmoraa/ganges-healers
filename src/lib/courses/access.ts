import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

/** Archived catalogs stay hidden publicly while paid/activated owners retain their curriculum. */
export const readCourseForViewer = cache(async (slug: string) => {
  const course = await prisma.course.findFirst({
    where: { OR: [{ id: slug }, { slug }] },
    include: { lessons: { orderBy: [{ order: 'asc' }, { id: 'asc' }], select: { id: true, title: true, order: true } }, _count: { select: { enrollments: true } } },
  })
  if (!course || course.isActive) return course
  const session = await auth()
  if (!session?.user?.id) return null
  const enrollment = await prisma.courseEnrollment.findFirst({ where: { courseId: course.id, userId: session.user.id, status: { in: ['active', 'completed'] } }, select: { id: true } })
  return enrollment ? course : null
})
