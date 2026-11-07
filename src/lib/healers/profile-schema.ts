import { z } from 'zod'

export const healerProfileLimits = { bio: 2000, experienceYears: 100, specializations: 20, specialization: 100 }

export const healerProfileFields = z.object({
  bio: z.string().max(healerProfileLimits.bio).nullable(),
  experienceYears: z.number().int().min(0).max(healerProfileLimits.experienceYears),
  specializations: z.array(z.string().max(healerProfileLimits.specialization)).max(healerProfileLimits.specializations),
})
