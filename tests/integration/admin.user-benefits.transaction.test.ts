import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { updateUserBenefits, userBenefitsVersion, type UserBenefitsInput } from '@/lib/admin/user-benefits'

const suffix = randomUUID(), actorId = `z-benefits-admin-${suffix}`, ordinaryId = `y-benefits-user-${suffix}`
const targets: string[] = [], plans: string[] = [], payments: string[] = []
let targetId = ''
const current = () => prisma.user.findUniqueOrThrow({ where: { id: targetId } })
const input = async (override: Partial<UserBenefitsInput> = {}): Promise<UserBenefitsInput> => ({ userId: targetId, version: userBenefitsVersion(await current()), vip: true, freeSessionCredits: 7, reason: 'Service recovery', ...override })
const auditCount = () => prisma.activityLog.count({ where: { action: 'user_benefits_updated', entityId: targetId } })
async function waiting() {
  for (let n = 0; n < 200; n++) {
    const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON l.pid=a.pid WHERE a.datname=current_database() AND NOT l.granted AND a.query LIKE ${'%SELECT "id" FROM "User"%FOR UPDATE%'}) AS waiting`
    if (rows[0].waiting) return true
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  return false
}
beforeAll(async () => {
  for (const [id, role] of [[actorId, 'ADMIN'], [ordinaryId, 'USER']] as const) await prisma.user.create({ data: { id, email: `${id}@example.test`, role } })
})
beforeEach(async () => { targetId = `a-benefits-${randomUUID()}`; targets.push(targetId); await prisma.user.create({ data: { id: targetId, email: `${targetId}@example.test`, name: 'Original account', password: 'stored-credential', securityVersion: 3, freeSessionCredits: 2 } }) })
afterAll(async () => {
  try {
    await prisma.activityLog.deleteMany({ where: { userId: { in: [actorId, ordinaryId] } } })
    await prisma.payment.deleteMany({ where: { id: { in: payments } } })
    await prisma.user.deleteMany({ where: { id: { in: [actorId, ordinaryId, ...targets] } } })
    await prisma.membershipPlan.deleteMany({ where: { id: { in: plans } } })
  } finally { await prisma.$disconnect() }
})

test('an authorized change updates only manual benefits and records before/after/reason once', async () => {
  const before = await current(), saved = await input()
  const result = await updateUserBenefits(actorId, saved)
  expect(result.changed).toBe(true); expect(result.user).toMatchObject({ id: targetId, vip: true, freeSessionCredits: 7 })
  const after = await current()
  expect(after).toEqual({ ...before, vip: true, freeSessionCredits: 7, updatedAt: after.updatedAt })
  expect(result.user.version).toBe(userBenefitsVersion(after))
  expect(await prisma.activityLog.findFirstOrThrow({ where: { entityId: targetId } })).toMatchObject({ userId: actorId, action: 'user_benefits_updated', metadata: { before: { vip: false, freeSessionCredits: 2 }, after: { vip: true, freeSessionCredits: 7 }, reason: 'Service recovery' } })
  await expect(updateUserBenefits(actorId, saved)).rejects.toMatchObject({ code: 'USER_BENEFITS_CHANGED' }); expect(await auditCount()).toBe(1)
})
test('saved subscription terms, credit ledgers and payments remain unchanged', async () => {
  const plan = await prisma.membershipPlan.create({ data: { slug: `benefits-${randomUUID()}`, title: 'Saved plan', interval: 'MONTHLY', pricePaise: 1999, razorpayPlanId: `plan_${randomUUID()}` } }); plans.push(plan.id)
  const membership = await prisma.vIPMembership.create({ data: { userId: targetId, planId: plan.id, subscriptionId: `sub_${randomUUID()}`, status: 'active', endDate: new Date(Date.now() + 86400000) } })
  const ledger = await prisma.sessionCredit.create({ data: { userId: targetId, membershipId: membership.id, credits: 4, source: 'membership', expiresAt: membership.endDate } })
  const payment = await prisma.payment.create({ data: { userId: targetId, gateway: 'razorpay', type: 'MEMBERSHIP', status: 'success', statusEnum: 'SUCCESS', amountPaise: 1999 } }); payments.push(payment.id)
  await updateUserBenefits(actorId, await input())
  expect(await prisma.membershipPlan.findUnique({ where: { id: plan.id } })).toEqual(plan)
  expect(await prisma.vIPMembership.findUnique({ where: { id: membership.id } })).toEqual(membership)
  expect(await prisma.sessionCredit.findUnique({ where: { id: ledger.id } })).toEqual(ledger)
  expect(await prisma.payment.findUnique({ where: { id: payment.id } })).toEqual(payment)
})
test('invalid credit balances cannot update an account or create an audit', async () => {
  const before = await current()
  for (const freeSessionCredits of [-1, 1.5, 2147483648]) await expect(updateUserBenefits(actorId, await input({ freeSessionCredits }))).rejects.toMatchObject({ status: 400, code: 'INVALID_BENEFITS' })
  expect(await current()).toEqual(before); expect(await auditCount()).toBe(0)
})
test('a same-timestamp credit consumption invalidates an administrator review', async () => {
  const before = await current(), saved = await input()
  await prisma.user.update({ where: { id: targetId }, data: { freeSessionCredits: { decrement: 1 }, updatedAt: before.updatedAt } })
  await expect(updateUserBenefits(actorId, saved)).rejects.toMatchObject({ status: 409, code: 'USER_BENEFITS_CHANGED' })
  expect((await current()).freeSessionCredits).toBe(1); expect(await auditCount()).toBe(0)
})
test('changed account identity cannot receive an old reviewed edit', async () => {
  const before = await current(), saved = await input()
  await prisma.user.update({ where: { id: targetId }, data: { email: `changed-${randomUUID()}@example.test`, updatedAt: before.updatedAt } })
  await expect(updateUserBenefits(actorId, saved)).rejects.toMatchObject({ code: 'USER_BENEFITS_CHANGED' }); expect(await auditCount()).toBe(0)
})
test('competing saves based on one review can commit only one adjustment and audit', async () => {
  const saved = await input(), results = await Promise.allSettled([updateUserBenefits(actorId, saved), updateUserBenefits(actorId, { ...saved, freeSessionCredits: 8 })])
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1); expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  expect(await auditCount()).toBe(1)
})
test('ordinary, missing and revoked administrators cannot write, and absent targets are explicit', async () => {
  const saved = await input()
  await expect(updateUserBenefits(ordinaryId, saved)).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  await expect(updateUserBenefits(randomUUID(), saved)).rejects.toMatchObject({ code: 'FORBIDDEN' })
  try { await prisma.user.update({ where: { id: actorId }, data: { role: 'USER' } }); await expect(updateUserBenefits(actorId, saved)).rejects.toMatchObject({ code: 'FORBIDDEN' }) }
  finally { await prisma.user.update({ where: { id: actorId }, data: { role: 'ADMIN' } }) }
  await expect(updateUserBenefits(actorId, { ...saved, userId: randomUUID() })).rejects.toMatchObject({ status: 404, code: 'USER_NOT_FOUND' })
  expect(await auditCount()).toBe(0)
})
test('an unchanged submission is a no-op without a duplicate audit', async () => {
  const before = await current()
  expect((await updateUserBenefits(actorId, await input({ vip: false, freeSessionCredits: 2 }))).changed).toBe(false)
  expect(await current()).toEqual(before); expect(await auditCount()).toBe(0)
})
test('a committed credit writer holding the account lock is checked before a manual adjustment', async () => {
  let release!: () => void, acquired!: () => void
  const ready = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve }), saved = await input()
  const writer = prisma.$transaction(async tx => { await tx.user.update({ where: { id: targetId }, data: { freeSessionCredits: { decrement: 1 } } }); acquired(); await unlock }, { timeout: 15000 })
  await ready; const operation = updateUserBenefits(actorId, saved); void operation.catch(() => {})
  try { expect(await waiting()).toBe(true) } finally { release(); await writer }
  await expect(operation).rejects.toMatchObject({ code: 'USER_BENEFITS_CHANGED' }); expect((await current()).freeSessionCredits).toBe(1); expect(await auditCount()).toBe(0)
})
test('administrator revocation committed while waiting is rechecked after acquiring locks', async () => {
  let release!: () => void, acquired!: () => void
  const ready = new Promise<void>(resolve => { acquired = resolve }), unlock = new Promise<void>(resolve => { release = resolve }), saved = await input()
  const writer = prisma.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${targetId} FOR UPDATE`; acquired(); await unlock }, { timeout: 15000 })
  await ready; const operation = updateUserBenefits(actorId, saved); void operation.catch(() => {})
  try { expect(await waiting()).toBe(true); await prisma.user.update({ where: { id: actorId }, data: { role: 'USER' } }) }
  finally { release(); await writer }
  try { await expect(operation).rejects.toMatchObject({ code: 'FORBIDDEN' }); expect(await auditCount()).toBe(0) }
  finally { await prisma.user.update({ where: { id: actorId }, data: { role: 'ADMIN' } }) }
})
test('a failed audit insert rolls back the benefit change', async () => {
  const before = await current(), constraint = `qa_benefits_${randomUUID().replaceAll('-', '')}`
  // This suite runs only on the guarded disposable PostgreSQL test database.
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "${constraint}" CHECK ("entityId" <> '${targetId}') NOT VALID`)
  try { await expect(updateUserBenefits(actorId, await input())).rejects.toThrow(); expect(await current()).toEqual(before); expect(await auditCount()).toBe(0) }
  finally { await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${constraint}"`) }
})
