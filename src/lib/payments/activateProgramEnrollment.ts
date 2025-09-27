import { prisma } from '@/lib/prisma'

interface ActivateArgs {
  paymentId?: string
  orderId?: string
  client?: typeof prisma
}

export interface ActivationResult {
  found: boolean
  isProgram: boolean
  hasEnrollmentId: boolean
  activated: boolean
  idempotent: boolean
  updatedRows: number
  reason?: string
  enrollmentId?: string
  paymentId?: string
  orderId?: string
}

function buildSchedule(totalSessions: number, sessionsPerWeek: number, durationMinutes: number, start: Date) {
  const perWeek = Math.max(1, sessionsPerWeek)
  const offsets: number[] = []
  for (let i = 0; i < perWeek; i++) offsets.push(Math.floor((i * 7) / perWeek))
  const sessions: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  for (let i = 0; i < totalSessions; i++) {
    const cycle = Math.floor(i / perWeek)
    const idxInWeek = i % perWeek
    const dayOffset = offsets[idxInWeek] + cycle * 7
    const startDate = new Date(start.getTime() + dayOffset * 24 * 60 * 60 * 1000)
    sessions.push({ index: i, scheduledAt: startDate.toISOString(), durationMinutes, status: 'scheduled' })
  }
  const endDate = sessions.length ? new Date(new Date(sessions[sessions.length - 1].scheduledAt).getTime() + durationMinutes * 60000) : null
  return { sessions, endDate }
}

export async function activateProgramEnrollment(args: ActivateArgs): Promise<ActivationResult> {
  const client = args.client || prisma
  const orClauses: any[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
  if (args.paymentId) orClauses.push({ gatewayPaymentId: args.paymentId })
  if (args.orderId) orClauses.push({ gatewayOrderId: args.orderId })
  const payment = await client.payment.findFirst({
    where: { OR: orClauses }
  })
  if (!payment) {
    console.warn('[programs][enroll][activation][no_payment]', { paymentId: args.paymentId, orderId: args.orderId })
    return { found: false, isProgram: false, hasEnrollmentId: false, activated: false, idempotent: false, updatedRows: 0, reason: 'payment_not_found', paymentId: args.paymentId, orderId: args.orderId }
  }

  // ensure we have latest success status but activation does not rely on it
  if (payment.type !== 'PROGRAM') {
    return { found: true, isProgram: false, hasEnrollmentId: false, activated: false, idempotent: false, updatedRows: 0, reason: 'not_program', paymentId: payment.id, orderId: payment.gatewayOrderId || undefined }
  }
  const meta: any = payment.metadata || {} // eslint-disable-line @typescript-eslint/no-explicit-any
  const enrollmentId = meta.enrollmentId as string | undefined
  if (!enrollmentId) {
    console.warn('[programs][enroll][activation][missing_enrollmentId]', { paymentId: payment.id })
    return { found: true, isProgram: true, hasEnrollmentId: false, activated: false, idempotent: false, updatedRows: 0, reason: 'missing_enrollmentId', paymentId: payment.id, orderId: payment.gatewayOrderId || undefined }
  }

  const result = await client.$transaction(async (tx) => {
    const enrollment = await tx.programEnrollment.findUnique({ where: { id: enrollmentId } })
    if (!enrollment) {
      console.warn('[programs][enroll][activation][no_enrollment]', { enrollmentId, paymentId: payment.id })
      return { activated: false, idempotent: false, updatedRows: 0 }
    }
    if (enrollment.status === 'active') {
      return { activated: false, idempotent: true, updatedRows: 0 }
    }
    if (enrollment.status !== 'pending_payment') {
      return { activated: false, idempotent: false, updatedRows: 0 }
    }
  const program = await tx.program.findUnique({ where: { id: enrollment.programId } })
    if (!program) {
      console.warn('[programs][enroll][activation][program_missing]', { programId: enrollment.programId, enrollmentId })
      return { activated: false, idempotent: false, updatedRows: 0 }
    }
    const now = new Date()
    const { sessions, endDate } = buildSchedule(program.totalSessions, program.sessionsPerWeek, program.durationMinutes, now)
    const updated = await tx.programEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: 'active',
        startDate: now,
        endDate: endDate || undefined,
        schedule: sessions,
        progress: { sessionsCompleted: 0, nextSessionIndex: 0 },
        healerId: (meta.healerId as string | undefined) || enrollment.healerId || undefined,
      }
    })
    return { activated: true, idempotent: false, updatedRows: 1, updated }
  })

  if (result.activated) {
    console.log('[programs][enroll][activated]', { enrollmentId, paymentId: payment.id })
    return { found: true, isProgram: true, hasEnrollmentId: true, activated: true, idempotent: false, updatedRows: 1, enrollmentId, paymentId: payment.id, orderId: payment.gatewayOrderId || undefined }
  }
  if (result.idempotent) {
    console.log('[programs][enroll][idempotent]', { enrollmentId, paymentId: payment.id })
    return { found: true, isProgram: true, hasEnrollmentId: true, activated: false, idempotent: true, updatedRows: 0, enrollmentId, paymentId: payment.id, orderId: payment.gatewayOrderId || undefined }
  }
  return { found: true, isProgram: true, hasEnrollmentId: true, activated: false, idempotent: false, updatedRows: 0, enrollmentId, paymentId: payment.id, orderId: payment.gatewayOrderId || undefined }
}
