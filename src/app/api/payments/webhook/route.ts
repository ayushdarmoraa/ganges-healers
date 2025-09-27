import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { activateProgramEnrollment } from '@/lib/payments/activateProgramEnrollment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function POST(req: Request) {
  const raw = await req.text()
  const signature = req.headers.get('x-razorpay-signature') || ''
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || ''
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex')
  if (expected !== signature) {
    console.warn('[payments][webhook][hmac-mismatch]')
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 400 })
  }

  let payload: any // eslint-disable-line @typescript-eslint/no-explicit-any
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  try {
    const evt = payload.event
    if (evt === 'payment.captured') {
      const p = payload.payload?.payment?.entity
      if (p?.id) {
        const found = await prisma.payment.findFirst({ where: { OR: [{ gatewayPaymentId: p.id }, { gatewayOrderId: p.order_id }] } })
        if (found && found.statusEnum !== 'SUCCESS') {
          await prisma.payment.update({ where: { id: found.id }, data: { gatewayPaymentId: p.id, statusEnum: 'SUCCESS', status: 'success' } })
        } else if (found && !found.gatewayPaymentId) {
          // ensure gatewayPaymentId is stored even if already success
          await prisma.payment.update({ where: { id: found.id }, data: { gatewayPaymentId: p.id } })
        }
        const activation = await activateProgramEnrollment({ paymentId: p.id, orderId: p.order_id })
        console.log('[payments][webhook][captured]', { gatewayPaymentId: p.id, activation })
      }
    } else if (evt === 'subscription.activated') {
      const sub = payload.payload?.subscription?.entity
      if (sub?.id) {
        const membership = await prisma.vIPMembership.findFirst({ where: { subscriptionId: sub.id } })
        if (!membership) {
          console.warn('[membership][activated][no_membership]', { subscriptionId: sub.id })
        } else if (membership.status === 'active') {
          console.log('[membership][idempotent]', { membershipId: membership.id, subscriptionId: sub.id, userId: membership.userId, planId: membership.planId })
        } else {
          const plan = await prisma.membershipPlan.findUnique({ where: { id: membership.planId } })
          const updated = await prisma.vIPMembership.update({
            where: { id: membership.id },
            data: {
              status: 'active',
              startDate: membership.startDate ?? new Date(),
              nextBillingAt: sub.current_end ? new Date(sub.current_end * 1000) : membership.nextBillingAt
            }
          })
          // Provision benefits once per activation: check existing session credits for this membership
          let benefitsGranted = false
          if (plan?.benefits) {
            const benefits = plan.benefits as any // eslint-disable-line @typescript-eslint/no-explicit-any
            // Cycle boundary if provided (current_start epoch seconds)
            const cycleStart = sub.current_start ? new Date(sub.current_start * 1000) : null
            const existingCredit = await prisma.sessionCredit.findFirst({ where: { membershipId: membership.id } })
            const grantAllowed = !existingCredit // MVP simple rule: only if none exists (no per-cycle accumulation)
            if (grantAllowed) {
              const free = typeof benefits.freeSessions === 'number' ? benefits.freeSessions : 0
              if (free > 0) {
                await prisma.sessionCredit.create({ data: { userId: membership.userId, membershipId: membership.id, credits: free, source: 'vip_membership' } })
                benefitsGranted = true
              }
              // Elevate user VIP flag
              await prisma.user.update({ where: { id: membership.userId }, data: { vip: true } })
              console.log('[membership][benefits_granted]', { membershipId: membership.id, freeSessions: free, subscriptionId: sub.id, userId: membership.userId, planId: membership.planId, cycleStart })
            } else {
              console.log('[membership][benefits_skipped]', { membershipId: membership.id, subscriptionId: sub.id, userId: membership.userId, planId: membership.planId, reason: 'already_granted' })
            }
          }
          console.log('[membership][activated]', { membershipId: updated.id, subscriptionId: sub.id, userId: membership.userId, planId: membership.planId, benefitsGranted })
        }
      }
    } else if (evt === 'subscription.paused') {
      const sub = payload.payload?.subscription?.entity
      if (sub?.id) {
        const membership = await prisma.vIPMembership.findFirst({ where: { subscriptionId: sub.id } })
        if (membership && membership.status !== 'paused') {
          await prisma.vIPMembership.update({ where: { id: membership.id }, data: { status: 'paused' } })
          console.log('[membership][paused]', { membershipId: membership.id })
        } else if (membership) {
          console.log('[membership][idempotent]', { membershipId: membership.id, status: membership.status })
        }
      }
    } else if (evt === 'subscription.halted') {
      const sub = payload.payload?.subscription?.entity
      if (sub?.id) {
        const membership = await prisma.vIPMembership.findFirst({ where: { subscriptionId: sub.id } })
        if (membership && membership.status !== 'halted') {
          await prisma.vIPMembership.update({ where: { id: membership.id }, data: { status: 'halted' } })
          console.log('[membership][halted]', { membershipId: membership.id })
        } else if (membership) {
          console.log('[membership][idempotent]', { membershipId: membership.id, status: membership.status })
        }
      }
    } else if (evt === 'subscription.cancelled') {
      const sub = payload.payload?.subscription?.entity
      if (sub?.id) {
        const membership = await prisma.vIPMembership.findFirst({ where: { subscriptionId: sub.id } })
        if (membership && membership.status !== 'cancelled') {
          await prisma.vIPMembership.update({ where: { id: membership.id }, data: { status: 'cancelled', cancelledAt: new Date() } })
          console.log('[membership][cancelled]', { membershipId: membership.id })
        } else if (membership) {
          console.log('[membership][idempotent]', { membershipId: membership.id, status: membership.status })
        }
      }
    } else if (evt === 'payment.failed') {
      const p = payload.payload?.payment?.entity
      if (p?.id) {
        const result = await prisma.payment.updateMany({
          where: { gatewayPaymentId: p.id },
          data: { statusEnum: 'FAILED', status: 'failed' }
        })
        console.log('[payments][webhook][failed]', { updated: result.count, gatewayPaymentId: p.id })
      }
    } else if (evt === 'refund.processed') {
      const r = payload.payload?.refund?.entity
      if (r?.payment_id) {
        const payment = await prisma.payment.findFirst({ where: { gatewayPaymentId: r.payment_id } })
        if (payment) {
          await prisma.refund.upsert({
            where: { gatewayRefundId: r.id || '___none___' },
            update: { status: r.status, amountPaise: r.amount },
            create: {
              paymentId: payment.id,
              amountPaise: r.amount,
              gatewayRefundId: r.id || undefined,
              status: r.status,
              reason: r.notes?.reason || undefined,
            }
          })
          // If full refund (amount equals original), mark refunded
          if (payment.amountPaise === r.amount) {
            await prisma.payment.update({ where: { id: payment.id }, data: { statusEnum: 'REFUNDED', status: 'refunded' } })
            console.log('[payments][webhook][refunded-full]', { paymentId: payment.id })
          } else {
            console.log('[payments][webhook][refund-partial]', { paymentId: payment.id, refunded: r.amount })
          }
        }
      }
    }
  } catch (err) {
    console.error('[payments][webhook][error]', err)
    return NextResponse.json({ error: 'Webhook handling failed' }, { status: 500 })
  }
  console.log('[payments][webhook][ok]', { event: payload?.event })
  return NextResponse.json({ ok: true })
}
