import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - local client component resolution (Next build will transpile)
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user) redirect("/auth/signin")

  const bookings = await prisma.booking.findMany({
    where: { userId: session.user.id },
    orderBy: { scheduledAt: "asc" },
    take: 20,
    include: { service: true, healer: { include: { user: true } }, payment: true },
  })

  return <DashboardClient bookings={bookings} />
}