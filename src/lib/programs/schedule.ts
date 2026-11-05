import { z } from 'zod'

export const programFields = z.object({
  title: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().min(1).max(20000),
  pricePaise: z.coerce.number().int().min(1).max(2147483647),
  totalSessions: z.coerce.number().int().min(1).max(366),
  sessionsPerWeek: z.coerce.number().int().min(1).max(7),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
})

export interface ProgramOutlineSession {
  sessionNumber: number
  suggestedAt: string
  durationMin: number
  legacyCompleted: boolean
}

/** The activation snapshot defines the purchased session count/duration, not a later catalog edit. */
export function readProgramOutline(value: unknown): ProgramOutlineSession[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 366) return null
  const result: ProgramOutlineSession[] = []
  for (let index = 0; index < value.length; index++) {
    const row: unknown = value[index]
    if (!row || typeof row !== 'object' || !('scheduledAt' in row) || !('durationMinutes' in row)) return null
    const { scheduledAt, durationMinutes } = row
    if (typeof scheduledAt !== 'string' || !Number.isFinite(Date.parse(scheduledAt)) ||
        typeof durationMinutes !== 'number' || !Number.isSafeInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) return null
    const offset = index ? Date.parse(scheduledAt) - Date.parse(result[0].suggestedAt) : 0
    if (offset < 0 || offset > 366 * 7 * 86400000) return null
    result.push({ sessionNumber: index + 1, suggestedAt: scheduledAt, durationMin: durationMinutes, legacyCompleted: 'status' in row && row.status === 'completed' })
  }
  return result
}

/** Proposed dates are guidance until a staff member confirms a conflict-checked reservation. */
export function buildProgramSchedule(totalSessions: number, sessionsPerWeek: number, durationMinutes: number, start: Date) {
  const parsed = programFields.pick({ totalSessions: true, sessionsPerWeek: true, durationMinutes: true }).parse({ totalSessions, sessionsPerWeek, durationMinutes })
  const sessions = Array.from({ length: parsed.totalSessions }, (_, index) => {
    const dayOffset = Math.floor(index / parsed.sessionsPerWeek) * 7 + Math.floor((index % parsed.sessionsPerWeek) * 7 / parsed.sessionsPerWeek)
    return { index, scheduledAt: new Date(start.getTime() + dayOffset * 86400000).toISOString(), durationMinutes: parsed.durationMinutes, status: 'scheduled' }
  })
  const endDate = new Date(Date.parse(sessions[sessions.length - 1].scheduledAt) + parsed.durationMinutes * 60000)
  return { sessions, endDate }
}
