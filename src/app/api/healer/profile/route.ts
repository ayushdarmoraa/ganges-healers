import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireHealer } from '@/lib/auth/requireHealer'
import { z } from 'zod'
import { healerProfileFields } from '@/lib/healers/profile-schema'

const profileUpdateSchema = healerProfileFields.extend({
  certifications: z.array(z.record(z.string(), z.unknown())),
  isActive: z.boolean(),
}).partial()

export async function GET() {
  try {
    const { healer } = await requireHealer()

    const profile = await prisma.healer.findUnique({
      where: { id: healer.id },
      select: {
        id: true,
        bio: true,
        experienceYears: true,
        certifications: true,
        specializations: true,
        availability: true,
        isActive: true,
        isVerified: true,
        rating: true,
        user: {
          select: { name: true, email: true, image: true, phone: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: profile })
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status },
      )
    }
    console.error('Healer profile GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { healer } = await requireHealer()

    const body = await request.json()
    const parsed = profileUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { certifications, ...rest } = parsed.data
    const data: Record<string, unknown> = { ...rest }
    if (certifications !== undefined) {
      data.certifications = certifications as unknown as import('@prisma/client').Prisma.InputJsonValue
    }

    const updated = await prisma.healer.update({
      where: { id: healer.id },
      data,
      select: {
        id: true,
        bio: true,
        experienceYears: true,
        certifications: true,
        specializations: true,
        availability: true,
        isActive: true,
        isVerified: true,
        rating: true,
        user: {
          select: { name: true, email: true, image: true, phone: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: updated })
  } catch (error: unknown) {
    const status = (error as { status?: number }).status
    if (status === 401 || status === 403) {
      return NextResponse.json(
        { error: (error as Error).message },
        { status },
      )
    }
    console.error('Healer profile PATCH error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
