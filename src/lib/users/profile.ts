import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type ProfileValues = { id: string; name: string | null; phone: string | null }
export type ProfileChanges = { name?: string; phone?: string | null; image?: string | null }

export class ProfileUpdateError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message) }
}

/** Only editable profile fields affect the opaque version; unrelated account activity does not discard drafts. */
export function profileVersion(profile: ProfileValues): string {
  return createHash('sha256').update(JSON.stringify([profile.id, profile.name, profile.phone])).digest('hex')
}

const selection = { id: true, name: true, email: true, phone: true, image: true } as const

/** Compare and save atomically, including against writers that do not use application advisory locks. */
export async function updateOwnProfile(userId: string, changes: ProfileChanges, expectedVersion?: string) {
  try {
    return await prisma.$transaction(async tx => {
      const current = await tx.user.findUnique({ where: { id: userId, closedAt: null }, select: selection })
      if (!current) throw new ProfileUpdateError('User not found', 404)
      if (expectedVersion && profileVersion(current) !== expectedVersion) throw new ProfileUpdateError('Your saved profile changed. Discard the draft and reload before saving again.', 409, 'PROFILE_CHANGED')
      const changed = await tx.user.updateMany({
        where: { id: userId, closedAt: null, name: current.name, phone: current.phone, ...(changes.image !== undefined ? { image: current.image } : {}) },
        data: { ...changes, ...(changes.phone !== undefined && changes.phone !== current.phone ? { phoneVerifiedAt: null, phoneVerifiedHash: null } : {}) },
      })
      if (changed.count !== 1) throw new ProfileUpdateError('Your saved profile changed. Discard the draft and reload before saving again.', 409, 'PROFILE_CHANGED')
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: selection })
      return { user, profileVersion: profileVersion(user) }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ProfileUpdateError('Phone number already in use', 409)
    throw error
  }
}
