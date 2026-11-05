import { randomUUID, createHmac } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createMembershipCheckout, membershipQuoteId } from '@/lib/memberships/checkout'
import { hasVipAccess } from '@/lib/memberships/access'
import { applyMembershipEvent } from '@/lib/memberships/webhook'
import { POST } from '@/app/api/payments/webhook/route'
import { GET as getMembership } from '@/app/api/memberships/me/route'
import type { MembershipPlan } from '@prisma/client'

jest.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: process.env.FULFILLMENT_USER_ID } }) }))
jest.mock('@/lib/invoices', () => ({ createAndStoreInvoicePdf: jest.fn() }))
let userId: string
let plan: MembershipPlan
let checkout: { id: string; shortUrl: string }
const now = Math.floor(Date.now() / 1000)
const gateway = jest.fn(async () => ({ id: `sub_${randomUUID()}`, short_url: 'https://rzp.io/i/test-member' }))

function event(name = 'subscription.charged', paymentId = `pay_${randomUUID()}`, createdAt = now) {
  return { event: name, created_at: createdAt, payload: {
    subscription: { entity: { id: checkout.id, plan_id: plan.razorpayPlanId, current_start: now, current_end: now + 2592000 } },
    payment: { entity: { id: paymentId, amount: plan.pricePaise, currency: 'INR', status: 'captured' } },
  } }
}

beforeEach(async () => {
  gateway.mockClear()
  const user = await prisma.user.create({ data: { email: `membership_${randomUUID()}@example.com`, freeSessionCredits: 0 } })
  userId = user.id
  process.env.FULFILLMENT_USER_ID = userId
  plan = await prisma.membershipPlan.create({ data: { slug: `test-${randomUUID()}`, title: 'VIP Test', pricePaise: 19900, interval: 'MONTHLY', razorpayPlanId: `plan_${randomUUID()}`, benefits: { freeSessions: 2 } } })
  checkout = await createMembershipCheckout(userId, plan, gateway)
})
afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: userId } })
  await prisma.membershipPlan.deleteMany({ where: { id: plan.id } })
})
afterAll(async () => { await prisma.$disconnect() })

test('reuses an owned pending checkout and persists a frozen quote', async () => {
  expect(await createMembershipCheckout(userId, plan, gateway)).toEqual(checkout)
  expect(gateway).toHaveBeenCalledTimes(1)
  expect(gateway).toHaveBeenCalledWith(expect.objectContaining({ total_count: 1, notes: { userId, planId: plan.id } }))
  const membership = await prisma.vIPMembership.findUniqueOrThrow({ where: { subscriptionId: checkout.id } })
  expect(membership).toMatchObject({ userId, status: 'pending' })
  expect(await prisma.payment.findUnique({ where: { id: membershipQuoteId(membership.id) } })).toMatchObject({ userId, statusEnum: 'PENDING', amountPaise: plan.pricePaise, metadata: expect.objectContaining({ credits: 2, subscriptionId: checkout.id }) })
})

test('concurrent new checkouts return one persisted winner', async () => {
  const other = await prisma.user.create({ data: { email: `parallel_${randomUUID()}@example.com` } })
  try {
    const results = await Promise.all([createMembershipCheckout(other.id, plan, gateway), createMembershipCheckout(other.id, plan, gateway)])
    expect(results[0]).toEqual(results[1])
    expect(await prisma.vIPMembership.count({ where: { userId: other.id } })).toBe(1)
    expect(await prisma.payment.count({ where: { userId: other.id } })).toBe(1)
  } finally { await prisma.user.delete({ where: { id: other.id } }) }
})

test('activation without a captured charge cannot unlock VIP or issue credits', async () => {
  await applyMembershipEvent(event('subscription.activated'))
  expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({ vip: false, freeSessionCredits: 0 })
  expect(await prisma.sessionCredit.count({ where: { userId } })).toBe(0)
})

test('captured charge, concurrent replay, and activation grant exactly once using the saved benefits', async () => {
  const charge = event()
  await prisma.membershipPlan.update({ where: { id: plan.id }, data: { benefits: { freeSessions: 99 }, pricePaise: 29900 } })
  await Promise.all([applyMembershipEvent(charge), applyMembershipEvent(charge)])
  await applyMembershipEvent(event('subscription.activated'))
  expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({ vip: true, freeSessionCredits: 2 })
  expect(await prisma.sessionCredit.count({ where: { userId } })).toBe(1)
  expect(await prisma.payment.findUnique({ where: { gatewayPaymentId: charge.payload.payment.entity.id } })).toMatchObject({ userId, statusEnum: 'SUCCESS', amountPaise: 19900, type: 'MEMBERSHIP' })
  await expect(createMembershipCheckout(userId, plan, gateway)).rejects.toMatchObject({ status: 409 })
})

test.each(['amount', 'currency', 'status', 'plan'] as const)('rejects a mismatched %s without partially granting access', async field => {
  const charge = event()
  if (field === 'amount') charge.payload.payment.entity.amount = 1
  if (field === 'currency') charge.payload.payment.entity.currency = 'USD'
  if (field === 'status') charge.payload.payment.entity.status = 'authorized'
  if (field === 'plan') charge.payload.subscription.entity.plan_id = 'plan_different'
  await expect(applyMembershipEvent(charge)).rejects.toThrow()
  expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({ vip: false, freeSessionCredits: 0 })
  expect(await prisma.sessionCredit.count({ where: { userId } })).toBe(0)
  expect(await prisma.payment.count({ where: { userId, statusEnum: 'SUCCESS' } })).toBe(0)
})

test('cancelled membership keeps granted credits and cannot be resurrected by a late replay', async () => {
  const charge = event()
  await applyMembershipEvent(charge)
  await applyMembershipEvent(event('subscription.cancelled', undefined, now + 10))
  await applyMembershipEvent(charge)
  await applyMembershipEvent(event('subscription.activated', undefined, now + 20))
  expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({ vip: false, freeSessionCredits: 2 })
  expect(await prisma.vIPMembership.findUnique({ where: { subscriptionId: checkout.id } })).toMatchObject({ status: 'cancelled' })
})

test('a delayed earlier charge is recorded once without undoing a later cancellation', async () => {
  await applyMembershipEvent(event('subscription.cancelled', undefined, now + 10))
  await applyMembershipEvent(event())
  expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({ vip: false, freeSessionCredits: 2 })
})

test('a second charge on a single-cycle checkout is held for reconciliation', async () => {
  await applyMembershipEvent(event())
  await expect(applyMembershipEvent(event())).rejects.toThrow('MEMBERSHIP_UNEXPECTED_RENEWAL')
  expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({ freeSessionCredits: 2 })
})

test('membership response reports the current spendable balance rather than summing original grants', async () => {
  await applyMembershipEvent(event())
  await prisma.user.update({ where: { id: userId }, data: { freeSessionCredits: { decrement: 1 } } })
  const response = await getMembership()
  expect(await response.json()).toMatchObject({ credits: { total: 1 }, membership: { status: 'active' } })
})

test('signed webhook fulfills the bound checkout and is safe to replay through the real handler', async () => {
  process.env.RAZORPAY_WEBHOOK_SECRET = 'membership-test-secret'
  process.env.PAYMENT_EVENTS_ENABLED = 'true'
  const body = JSON.stringify(event())
  const signature = createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex')
  for (let i = 0; i < 2; i++) {
    const response = await POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body, headers: { 'x-razorpay-signature': signature } }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  }
  expect(await prisma.user.findUnique({ where: { id: userId } })).toMatchObject({ vip: true, freeSessionCredits: 2 })
})

test('an unbound subscription never creates a membership from gateway notes', async () => {
  const unknown = event()
  unknown.payload.subscription.entity.id = 'sub_unbound'
  expect(await applyMembershipEvent(unknown)).toEqual({ applied: false, reason: 'membership-not-found' })
  expect(await prisma.vIPMembership.count({ where: { userId } })).toBe(1)
})

test('expired access is rejected from the database and an owned new checkout can be opened', async () => {
  await applyMembershipEvent(event())
  await prisma.vIPMembership.update({ where: { subscriptionId: checkout.id }, data: { endDate: new Date('2020-01-01') } })
  expect(await hasVipAccess(userId)).toBe(false)
  expect(await (await getMembership()).json()).toMatchObject({ membership: { isExpired: true } })
  const next = await createMembershipCheckout(userId, plan, gateway)
  expect(next.id).not.toBe(checkout.id)
})
