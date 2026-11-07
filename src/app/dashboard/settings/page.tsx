import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import SettingsClient from "./SettingsClient"
import { profileVersion } from '@/lib/users/profile'

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/auth/signin")

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      password: true,
    },
  })

  if (!user) redirect("/auth/signin")

  return (
    <SettingsClient
      user={{
        id: user.id,
        profileVersion: profileVersion(user),
        name: user.name || "",
        email: user.email,
        phone: user.phone || "",
        image: user.image || "",
        passwordExists: !!user.password,
      }}
    />
  )
}
