import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import type { Prisma, Role } from '@prisma/client'
import { z } from 'zod'
import { lockTransaction } from '@/lib/db/locks'
import { validateProgramSessionSlot } from '@/lib/availability'
import { readProgramOutline } from './schedule'

export class ProgramAccessError extends Error {
  constructor(message: string, public readonly status: number) { super(message); this.name = 'ProgramAccessError' }
}
export interface ProgramActor { id: string; role: Role; healerId: string | null }
export type ProgramScope = 'mine' | 'healer' | 'admin'

/** Resolve current account/role rather than trusting caller-supplied enrollment or staff identities. */
export async function programActor(): Promise<ProgramActor> {
  const session = await auth()
  if (!session?.user?.id) throw new ProgramAccessError('Unauthorized', 401)
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, role: true, healer: { select: { id: true, isActive: true } } } })
  if (!user) throw new ProgramAccessError('Unauthorized', 401)
  return { id: user.id, role: user.role, healerId: user.role === 'HEALER' && user.healer?.isActive ? user.healer.id : null }
}

const enrollmentSelect = {
  id: true, userId: true, healerId: true, assignedHealerId: true, status: true, pricePaise: true, schedule: true,
  program: { select: { title: true, slug: true } }, user: { select: { name: true, email: true } },
  healer: { select: { id: true, user: { select: { name: true } } } },
  assignedHealer: { select: { id: true, user: { select: { name: true } } } },
  sessions: { orderBy: { sessionNumber: 'asc' }, select: { id: true, sessionNumber: true, durationMin: true, scheduledAt: true, status: true, completedAt: true, meetingLink: true } },
} satisfies Prisma.ProgramEnrollmentSelect

type Enrollment = Prisma.ProgramEnrollmentGetPayload<{ select: typeof enrollmentSelect }>
function manages(actor: ProgramActor, row: { healerId: string | null; assignedHealerId: string | null }) {
  return actor.role === 'ADMIN' || !!actor.healerId && actor.healerId === (row.assignedHealerId ?? row.healerId)
}
function view(row: Enrollment, actor: ProgramActor) {
  const outline = readProgramOutline(row.schedule)
  const saved = new Map(row.sessions.map(session => [session.sessionNumber, session]))
  const sessions = (outline ?? []).map(proposal => {
    const actual = saved.get(proposal.sessionNumber)
    return {
      sessionNumber: proposal.sessionNumber, durationMin: actual?.durationMin ?? proposal.durationMin,
      suggestedAt: proposal.suggestedAt, id: actual?.id ?? null,
      scheduledAt: actual?.scheduledAt.toISOString() ?? null, completedAt: actual?.completedAt?.toISOString() ?? null,
      status: actual?.status.toLowerCase() ?? (proposal.legacyCompleted ? 'completed' : 'proposed'),
      meetingLink: actual?.status === 'SCHEDULED' ? actual.meetingLink : null,
    }
  })
  const completedSessions = sessions.filter(session => session.status === 'completed').length
  const healer = row.assignedHealer ?? row.healer
  return {
    id: row.id, status: row.status, pricePaise: row.pricePaise, program: row.program,
    customerName: row.user.name || 'Customer', ...(manages(actor, row) ? { customerEmail: row.user.email } : {}),
    healer: healer ? { id: healer.id, name: healer.user.name || 'Healer' } : null,
    needsReview: !outline && ['active', 'completed'].includes(row.status),
    totalSessions: sessions.length, completedSessions,
    progressPercent: sessions.length ? Math.round(completedSessions / sessions.length * 100) : 0,
    sessions, canManage: manages(actor, row), canAssign: actor.role === 'ADMIN',
  }
}
export type ProgramEnrollmentView = ReturnType<typeof view>

/** Bounded, stable pagination; staff can see only their assigned enrollments. */
export async function listProgramEnrollments(actor: ProgramActor, scope: ProgramScope, page: number) {
  if (scope === 'admin' && actor.role !== 'ADMIN' || scope === 'healer' && !actor.healerId) throw new ProgramAccessError('Forbidden', 403)
  const where: Prisma.ProgramEnrollmentWhereInput = scope === 'mine' ? { userId: actor.id }
    : scope === 'admin' ? {} : { OR: [{ assignedHealerId: actor.healerId }, { assignedHealerId: null, healerId: actor.healerId }] }
  const rows = await prisma.programEnrollment.findMany({ where, select: enrollmentSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 10, take: 11 })
  return { items: rows.slice(0, 10).map(row => view(row, actor)), page, hasNextPage: page < 1000 && rows.length > 10 }
}

export async function getProgramEnrollment(actor: ProgramActor, id: string, client: Prisma.TransactionClient = prisma) {
  const row = await client.programEnrollment.findUnique({ where: { id }, select: enrollmentSelect })
  if (!row || row.userId !== actor.id && !manages(actor, row)) throw new ProgramAccessError('Enrollment not found', 404)
  return view(row, actor)
}

const number = z.number().int().min(1).max(366)
const meetingLink = z.string().url().max(2048).refine(value => new URL(value).protocol === 'https:', 'Use an HTTPS meeting link').nullable().optional()
export const programAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign'), healerId: z.string().cuid() }).strict(),
  z.object({ action: z.literal('schedule'), sessionNumber: number, scheduledAt: z.string().datetime({ offset: true }), meetingLink }).strict(),
  z.object({ action: z.literal('complete'), sessionNumber: number }).strict(),
  z.object({ action: z.literal('cancel'), sessionNumber: number }).strict(),
  z.object({ action: z.literal('pause') }).strict(),
  z.object({ action: z.literal('resume') }).strict(),
])
type ProgramAction = z.infer<typeof programAction>

/** Serialize staff changes with booking allocation's healer lock, then this enrollment's lock. */
export async function changeProgramEnrollment(actor: ProgramActor, id: string, action: ProgramAction) {
  if (actor.role !== 'ADMIN' && !actor.healerId) throw new ProgramAccessError('Forbidden', 403)
  if (action.action === 'assign' && actor.role !== 'ADMIN') throw new ProgramAccessError('Forbidden', 403)
  const initial = await prisma.programEnrollment.findUnique({ where: { id }, select: { healerId: true, assignedHealerId: true } })
  if (!initial || !manages(actor, initial)) throw new ProgramAccessError('Enrollment not found', 404)
  const initialHealer = initial.assignedHealerId ?? initial.healerId
  return prisma.$transaction(async tx => {
    const healerIds = [...new Set([initialHealer, action.action === 'assign' ? action.healerId : null].filter((value): value is string => !!value))].sort()
    for (const healerId of healerIds) await lockTransaction(tx, 'healer', healerId)
    await lockTransaction(tx, 'program', id)
    const row = await tx.programEnrollment.findUnique({ where: { id }, select: enrollmentSelect })
    if (!row || !manages(actor, row)) throw new ProgramAccessError('Enrollment not found', 404)
    if ((row.assignedHealerId ?? row.healerId) !== initialHealer) throw new ProgramAccessError('Practitioner assignment changed; refresh and try again.', 409)
    if (action.action === 'complete') {
      const existing = row.sessions.find(session => session.sessionNumber === action.sessionNumber)
      if (existing?.status === 'COMPLETED') return { success: true, idempotent: true, data: view(row, actor) }
    }
    if (action.action === 'resume') {
      if (row.status !== 'paused') throw new ProgramAccessError('Only a paused enrollment can be resumed.', 409)
      await tx.programEnrollment.update({ where: { id }, data: { status: 'active' } })
      return { success: true, data: await getProgramEnrollment(actor, id, tx) }
    }
    if (row.status !== 'active' && !(row.status === 'paused' && (action.action === 'assign' || action.action === 'cancel'))) throw new ProgramAccessError('Only an active enrollment can be managed.', 409)
    if (action.action === 'pause') {
      if (row.sessions.some(session => session.status === 'SCHEDULED')) throw new ProgramAccessError('Cancel reserved sessions before pausing the program.', 409)
      await tx.programEnrollment.update({ where: { id }, data: { status: 'paused' } })
      return { success: true, data: await getProgramEnrollment(actor, id, tx) }
    }
    if (action.action === 'assign') {
      if ((row.assignedHealerId ?? row.healerId) === action.healerId) return { success: true, idempotent: true, data: view(row, actor) }
      if (row.sessions.some(session => session.status === 'SCHEDULED')) throw new ProgramAccessError('Cancel or complete reserved sessions before changing the practitioner.', 409)
      const healer = await tx.healer.findUnique({ where: { id: action.healerId }, select: { isActive: true, user: { select: { role: true } } } })
      if (!healer?.isActive || healer.user.role !== 'HEALER') throw new ProgramAccessError('Practitioner not found or inactive.', 404)
      // Leave the originally purchased healer/payment binding intact for verified callback replays.
      await tx.programEnrollment.update({ where: { id }, data: { assignedHealerId: action.healerId } })
    } else {
      const outline = readProgramOutline(row.schedule)
      const proposal = outline?.find(session => session.sessionNumber === action.sessionNumber)
      if (!proposal) throw new ProgramAccessError('The purchased session schedule needs review.', 409)
      const existing = row.sessions.find(session => session.sessionNumber === action.sessionNumber)
      if (proposal.legacyCompleted || existing?.status === 'COMPLETED') throw new ProgramAccessError('A completed session cannot be changed.', 409)
      if (action.action === 'schedule') {
        if (!initialHealer) throw new ProgramAccessError('A practitioner must be assigned first.', 409)
        const healer = await tx.healer.findUnique({ where: { id: initialHealer }, select: { isActive: true, user: { select: { role: true } } } })
        if (!healer?.isActive || healer.user.role !== 'HEALER') throw new ProgramAccessError('Practitioner not found or inactive.', 409)
        const scheduledAt = new Date(action.scheduledAt)
        const check = await validateProgramSessionSlot(initialHealer, scheduledAt, proposal.durationMin, { client: tx, excludeProgramSessionId: existing?.id })
        if (!check.valid) throw new ProgramAccessError(check.error || 'Time slot not available', 409)
        const data = { healerId: initialHealer, scheduledAt, durationMin: proposal.durationMin, status: 'SCHEDULED' as const, completedAt: null, meetingLink: action.meetingLink === undefined ? existing?.meetingLink ?? null : action.meetingLink ? new URL(action.meetingLink).href : null }
        await tx.programSession.upsert({ where: { enrollmentId_sessionNumber: { enrollmentId: id, sessionNumber: action.sessionNumber } }, create: { ...data, enrollmentId: id, sessionNumber: action.sessionNumber }, update: data })
      } else {
        if (!existing || existing.status !== 'SCHEDULED') throw new ProgramAccessError('Confirm a session reservation first.', 409)
        if (action.action === 'complete' && existing.scheduledAt.getTime() + existing.durationMin * 60000 > Date.now()) throw new ProgramAccessError('A session can be completed after its reserved end time.', 409)
        await tx.programSession.update({ where: { id: existing.id }, data: action.action === 'complete' ? { status: 'COMPLETED', completedAt: new Date() } : { status: 'CANCELLED', meetingLink: null } })
        if (action.action === 'complete') {
          const actual = await tx.programSession.findMany({ where: { enrollmentId: id, status: 'COMPLETED' }, select: { sessionNumber: true } })
          const completed = new Set([...(outline ?? []).filter(session => session.legacyCompleted).map(session => session.sessionNumber), ...actual.map(session => session.sessionNumber).filter(number => outline!.some(session => session.sessionNumber === number))])
          const total = outline!.length
          const next = outline!.findIndex(session => !completed.has(session.sessionNumber))
          await tx.programEnrollment.update({ where: { id }, data: {
            progress: { sessionsCompleted: completed.size, totalSessions: total, percentComplete: Math.round(completed.size / total * 100), nextSessionIndex: next < 0 ? total : next },
            ...(completed.size === total ? { status: 'completed', endDate: new Date() } : {}),
          } })
        }
      }
    }
    console.log('[programs][sessions][updated]', { enrollmentId: id, action: action.action, actorId: actor.id })
    return { success: true, data: await getProgramEnrollment(actor, id, tx) }
  }, { maxWait: 10000, timeout: 10000 })
}
