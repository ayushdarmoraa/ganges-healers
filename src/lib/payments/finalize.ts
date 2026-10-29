import { prisma } from '@/lib/prisma'
import { activateProgramEnrollment } from './activateProgramEnrollment'
import { activateCourseEnrollment } from './activateCourseEnrollment'
import { activateStoreOrder } from './activateStoreOrder'
import { PaymentResourceError, lockPaymentResource, paymentResourceKey, resolvePaymentResource } from './resource'

/** Commit verified payment and purchase fulfillment together; safe for callback retries. */
export async function finalizePayment(input: { orderId: string; paymentId: string; signature: string; userId: string }) {
  return prisma.$transaction(async tx => {
    let payment = await tx.payment.findFirst({ where: { gatewayOrderId: input.orderId } })
    if (!payment) throw new PaymentResourceError('Payment not found', 404)
    if (payment.userId && payment.userId !== input.userId) throw new PaymentResourceError('Forbidden', 403)
    const type = payment.type ?? (payment.bookingId ? 'SESSION' : 'MEMBERSHIP')
    const key = paymentResourceKey(type, payment.bookingId, payment.metadata)
    await lockPaymentResource(tx, type, payment.bookingId, payment.metadata)
    // A concurrent callback may have committed while this transaction waited.
    payment = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } })
    if (paymentResourceKey(payment.type ?? type, payment.bookingId, payment.metadata) !== key) throw new PaymentResourceError('Payment resource changed', 409)
    if (payment.userId && payment.userId !== input.userId) throw new PaymentResourceError('Forbidden', 403)
    if (payment.gateway !== 'razorpay' || payment.currency !== 'INR'
      || !Number.isSafeInteger(payment.amountPaise) || payment.amountPaise <= 0) {
      throw new PaymentResourceError('Invalid payment configuration', 400)
    }
    if (payment.statusEnum === 'REFUNDED' || payment.status === 'refunded') throw new PaymentResourceError('Payment has been refunded', 409)
    const idempotent = payment.statusEnum === 'SUCCESS' || payment.status === 'success'
    if (idempotent && payment.gatewayPaymentId !== input.paymentId) throw new PaymentResourceError('Payment identifier mismatch', 409)
    const resource = await resolvePaymentResource({ userId: input.userId, type, bookingId: payment.bookingId, metadata: payment.metadata, settled: idempotent, client: tx })
    if ((!idempotent || resource.requiresFulfillment) && payment.amountPaise !== resource.amountPaise) {
      throw new PaymentResourceError('Amount does not match resource price', 400)
    }
    if (idempotent && !resource.requiresFulfillment) {
      return { payment, idempotent, activation: null, storeActivation: null, courseActivation: null }
    }
    const updated = idempotent ? payment : await tx.payment.update({
      where: { id: payment.id },
      data: { gatewayPaymentId: input.paymentId, gatewaySignature: input.signature, statusEnum: 'SUCCESS', status: 'success', type: resource.type, metadata: resource.metadata },
    })
    const args = { paymentId: input.paymentId, orderId: input.orderId, payment: updated, client: tx }
    const activation = await activateProgramEnrollment(args)
    const storeActivation = await activateStoreOrder(args)
    const courseActivation = await activateCourseEnrollment(args)
    if (resource.requiresFulfillment) {
      const fulfilled = type === 'PROGRAM' ? activation.activated || activation.idempotent
        : type === 'STORE' ? storeActivation.activated || storeActivation.idempotent
          : type === 'COURSE' ? courseActivation.activated || courseActivation.idempotent : true
      if (!fulfilled) throw new PaymentResourceError('Purchase fulfillment is unavailable', 409)
    }
    if (type === 'SESSION' && resource.requiresFulfillment && payment.bookingId) {
      await tx.booking.update({ where: { id: payment.bookingId }, data: { status: 'CONFIRMED' } })
    }
    return { payment: updated, idempotent, activation, storeActivation, courseActivation }
  }, { maxWait: 10000, timeout: 10000 })
}
