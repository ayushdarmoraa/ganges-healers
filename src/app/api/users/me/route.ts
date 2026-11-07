import { NextResponse } from "next/server"
import { z } from "zod"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { ProfileUpdateError, profileVersion, updateOwnProfile } from '@/lib/users/profile'
import { isInternationalPhone } from '@/config/phone'

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const headers = { 'Cache-Control': 'private, no-store' }

const PatchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(16).refine(value => value.length >= 10 || isInternationalPhone(value), 'Use an international phone or at least 10 characters.').optional().nullable(),
  image: z.string().url().max(2048).optional().nullable(),
})

export async function PATCH(req: Request) {
  try {
    const origin = req.headers.get('origin')
    if (req.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Use a JSON request' }, { status: 415, headers })
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
    }

    const owner = req.headers.get('x-account-id')
    const version = req.headers.get('if-match')
    if (owner !== null && owner !== session.user.id) return NextResponse.json({ error: 'Your account changed. Reload account settings.', code: 'SESSION_CHANGED' }, { status: 409, headers })
    if ((owner !== null || version !== null) && (!owner || !version || !/^"[a-f0-9]{64}"$/.test(version))) return NextResponse.json({ error: 'Reload your saved profile and try again.' }, { status: 400, headers })
    const body = await req.json().catch(() => null)
    const parsed = PatchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400, headers })
    }

    const data = parsed.data

    // Only include fields that were actually provided
    const updateData: z.infer<typeof PatchSchema> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.phone !== undefined) updateData.phone = data.phone
    if (data.image !== undefined) updateData.image = data.image

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400, headers })
    }

    return NextResponse.json(await updateOwnProfile(session.user.id, updateData, version?.slice(1, -1)), { headers })
  } catch (err) {
    if (err instanceof ProfileUpdateError) return NextResponse.json({ error: err.message, ...(err.code ? { code: err.code } : {}) }, { status: err.status, headers })
    console.error("[users][me][patch][error]")
    return NextResponse.json({ error: "Update failed" }, { status: 500, headers })
  }
}

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id, closedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        role: true,
        vip: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404, headers })
    }

    return NextResponse.json({ user, profileVersion: profileVersion(user) }, { headers })
  } catch {
    console.error("[users][me][get][error]")
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500, headers })
  }
}
