import { NextResponse } from "next/server"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { lockTransaction } from '@/lib/db/locks'
import { recoveryPasswordSchema } from '@/lib/auth/password-reset'

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: recoveryPasswordSchema,
})

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const parsed = PasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 })
    }

    const { currentPassword, newPassword } = parsed.data

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!user.password) {
      return NextResponse.json(
        { error: "Cannot change password for OAuth accounts. You signed in with a social provider." },
        { status: 400 }
      )
    }

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
    }

    const hashed = await bcrypt.hash(newPassword, 12)
    const userId = user.id
    const changed = await prisma.$transaction(async tx => {
      await lockTransaction(tx, 'credentials', userId)
      const updated = await tx.user.updateMany({
        where: { id: userId, password: user.password },
        data: { password: hashed, passwordChangedAt: new Date() },
      })
      if (updated.count !== 1) return false
      await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: `password-reset:${userId}:` } } })
      return true
    })
    if (!changed) return NextResponse.json({ error: 'Your password changed during this request. Sign in again and retry.' }, { status: 409 })

    console.log("[users][me][password][changed]", { userId: session.user.id })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[users][me][password][error]", err)
    return NextResponse.json({ error: "Password change failed" }, { status: 500 })
  }
}
