import { prisma } from '@/lib/prisma'
import type { Payment, Prisma } from '@prisma/client'

interface ActivateArgs {
  paymentId?: string
  orderId?: string
  client?: Prisma.TransactionClient
  payment?: Payment
}

export interface CourseActivationResult {
  found: boolean
  isCourse: boolean
  hasEnrollmentId: boolean
  activated: boolean
  idempotent: boolean
  enrollmentId?: string
  paymentId?: string
  orderId?: string
  reason?: string
}

async function activate(args: ActivateArgs, client: Prisma.TransactionClient): Promise<CourseActivationResult> {
  const orClauses: { gatewayPaymentId?: string; gatewayOrderId?: string }[] = []
  if (args.paymentId) orClauses.push({ gatewayPaymentId: args.paymentId })
  if (args.orderId) orClauses.push({ gatewayOrderId: args.orderId })
  if (!orClauses.length) {
    return { found: false, isCourse: false, hasEnrollmentId: false, activated: false, idempotent: false, reason: 'no_identifiers' }
  }

  const payment = args.payment ?? await client.payment.findFirst({ where: { OR: orClauses } })
  if (!payment) {
    return { found: false, isCourse: false, hasEnrollmentId: false, activated: false, idempotent: false, reason: 'payment_not_found', paymentId: args.paymentId, orderId: args.orderId }
  }

  if (payment.type !== 'COURSE') {
    return { found: true, isCourse: false, hasEnrollmentId: false, activated: false, idempotent: false, reason: 'not_course', paymentId: payment.id }
  }

  if (payment.statusEnum !== 'SUCCESS' && payment.status !== 'success') {
    return { found: true, isCourse: true, hasEnrollmentId: false, activated: false, idempotent: false, reason: 'payment_not_successful' }
  }
  const meta = payment.metadata && typeof payment.metadata === 'object' && !Array.isArray(payment.metadata) ? payment.metadata : {}
  const enrollmentId = typeof meta.enrollmentId === 'string' ? meta.enrollmentId : undefined
  if (!enrollmentId) {
    console.warn('[courses][activation][missing_enrollmentId]', { paymentId: payment.id })
    return { found: true, isCourse: true, hasEnrollmentId: false, activated: false, idempotent: false, reason: 'missing_enrollmentId', paymentId: payment.id }
  }

  const enrollment = await client.courseEnrollment.findUnique({ where: { id: enrollmentId } })
  if (!enrollment) {
    console.warn('[courses][activation][enrollment_not_found]', { enrollmentId, paymentId: payment.id })
    return { found: true, isCourse: true, hasEnrollmentId: true, activated: false, idempotent: false, reason: 'enrollment_not_found', enrollmentId, paymentId: payment.id }
  }

  if (enrollment.status === 'active' || enrollment.status === 'completed') {
    return { found: true, isCourse: true, hasEnrollmentId: true, activated: false, idempotent: true, enrollmentId, paymentId: payment.id }
  }

  if (enrollment.status !== 'pending_payment') {
    return { found: true, isCourse: true, hasEnrollmentId: true, activated: false, idempotent: false, reason: 'unexpected_status', enrollmentId, paymentId: payment.id }
  }

  await client.courseEnrollment.update({
    where: { id: enrollmentId },
    data: { status: 'active' },
  })

  console.log('[courses][activation][activated]', { enrollmentId, paymentId: payment.id })
  return { found: true, isCourse: true, hasEnrollmentId: true, activated: true, idempotent: false, enrollmentId, paymentId: payment.id }
}

/** Keep enrollment writes in the same transaction as payment success. */
export function activateCourseEnrollment(args: ActivateArgs): Promise<CourseActivationResult> {
  return args.client ? activate(args, args.client) : prisma.$transaction(tx => activate(args, tx))
}
