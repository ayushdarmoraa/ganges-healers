import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - local client component resolution (Next build will transpile)
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const [bookings, recentPosts, courseEnrollments] = await Promise.all([
    prisma.booking.findMany({
      where: { userId: session.user.id },
      orderBy: { scheduledAt: "asc" },
      take: 20,
      include: { service: true, healer: { include: { user: true } }, payment: true },
    }),
    prisma.communityPost.findMany({
      orderBy: { createdAt: "desc" },
      take: 3,
      include: {
        user: { select: { name: true, image: true } },
        _count: { select: { comments: true, likes: true } },
      },
    }),
    prisma.courseEnrollment.findMany({
      where: { userId: session.user.id, status: { in: ['active', 'completed'] } },
      take: 3,
      orderBy: { createdAt: 'desc' },
      include: { course: { include: { _count: { select: { lessons: true } } } } },
    }),
  ])

  return <DashboardClient bookings={bookings} recentPosts={recentPosts} courseEnrollments={courseEnrollments} />
}
