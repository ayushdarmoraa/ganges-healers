import { prisma } from '@/lib/prisma'
import { buildProgramSchedule, readProgramOutline } from '@/lib/programs/schedule'
import type { Payment, Prisma } from '@prisma/client'

interface ActivateArgs {
  paymentId?: string
  orderId?: string
  client?: Prisma.TransactionClient
  payment?: Payment
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

async function activate(args: ActivateArgs, client: Prisma.TransactionClient): Promise<ActivationResult> {
  const orClauses: Array<{ gatewayPaymentId?: string; gatewayOrderId?: string }> = []
  if (args.paymentId) orClauses.push({ gatewayPaymentId: args.paymentId })
  if (args.orderId) orClauses.push({ gatewayOrderId: args.orderId })
  const payment = args.payment ?? await client.payment.findFirst({
    where: { OR: orClauses }
  })
  if (!payment) {
    console.warn('[programs][enroll][activation][no_payment]', { paymentId: args.paymentId, orderId: args.orderId })
    return { found: false, isProgram: false, hasEnrollmentId: false, activated: false, idempotent: false, updatedRows: 0, reason: 'payment_not_found', paymentId: args.paymentId, orderId: args.orderId }
  }

  if (payment.type !== 'PROGRAM') {
    return { found: true, isProgram: false, hasEnrollmentId: false, activated: false, idempotent: false, updatedRows: 0, reason: 'not_program', paymentId: payment.id, orderId: payment.gatewayOrderId || undefined }
  }
  if (payment.statusEnum !== 'SUCCESS' && payment.status !== 'success') {
    return { found: true, isProgram: true, hasEnrollmentId: false, activated: false, idempotent: false, updatedRows: 0, reason: 'payment_not_successful' }
  }
  const meta = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata) ? payment.metadata : {}
  const enrollmentId = typeof meta.enrollmentId === 'string' ? meta.enrollmentId : undefined
  if (!enrollmentId) {
    console.warn('[programs][enroll][activation][missing_enrollmentId]', { paymentId: payment.id })
    return { found: true, isProgram: true, hasEnrollmentId: false, activated: false, idempotent: false, updatedRows: 0, reason: 'missing_enrollmentId', paymentId: payment.id, orderId: payment.gatewayOrderId || undefined }
  }

  const result = await (async () => {
    const tx = client
    const enrollment = await tx.programEnrollment.findUnique({ where: { id: enrollmentId } })
    if (!enrollment) {
      console.warn('[programs][enroll][activation][no_enrollment]', { enrollmentId, paymentId: payment.id })
      return { activated: false, idempotent: false, updatedRows: 0 }
    }
    if (enrollment.status === 'active' || enrollment.status === 'completed') {
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
    const purchased = readProgramOutline(enrollment.schedule)
    if (enrollment.schedule != null && !purchased) return { activated: false, idempotent: false, updatedRows: 0 }
    const sessions = purchased ? purchased.map((session, index) => ({ index, scheduledAt: new Date(now.getTime() + Date.parse(session.suggestedAt) - Date.parse(purchased[0].suggestedAt)).toISOString(), durationMinutes: session.durationMin, status: 'scheduled' })) : buildProgramSchedule(program.totalSessions, program.sessionsPerWeek, program.durationMinutes, now).sessions
    const endDate = new Date(Math.max(...sessions.map(session => Date.parse(session.scheduledAt) + session.durationMinutes * 60000)))
    const updated = await tx.programEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: 'active',
        startDate: now,
        endDate: endDate || undefined,
        schedule: sessions,
        progress: { sessionsCompleted: 0, nextSessionIndex: 0 },
        healerId: enrollment.healerId || undefined,
      }
    })
    return { activated: true, idempotent: false, updatedRows: 1, updated }
  })()

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

/** Activate within the caller's payment transaction, or use a standalone transaction. */
export function activateProgramEnrollment(args: ActivateArgs): Promise<ActivationResult> {
  return args.client ? activate(args, args.client) : prisma.$transaction(tx => activate(args, tx))
}
