import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { accountClosureStatus, closeOwnAccount } from '@/lib/users/account-closure'
import { createRecentAuthentication, passwordVersion, sessionCredentialVersion, type RecentAuthentication } from '@/lib/auth/password-version'
import { confirmPasswordReset, requestPasswordReset } from '@/lib/auth/password-reset'
import { confirmEmailVerification } from '@/lib/auth/email-verification'
import { phoneVerificationStatus, requestPhoneVerification } from '@/lib/auth/phone-verification'
import { twoFactorStatus, verifyTwoFactorLogin } from '@/lib/auth/two-factor'
import { updateOwnProfile } from '@/lib/users/profile'
import { emailService } from '@/lib/email/email.service'

jest.mock('@/lib/email/email.service', () => ({ emailService: { sendPasswordReset: jest.fn(async () => ({ success: true })) } }))
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
let userId = '', staffId = '', healerId = '', serviceId = '', planId = '', programId = '', courseId = '', productId = ''
const account = () => prisma.user.findUniqueOrThrow({ where: { id: userId } })
async function proof(issuedAt?: number) { const user = await account(); return createRecentAuthentication(user.id, sessionCredentialVersion(user.password, user.securityVersion), issuedAt)! }
async function review(authentication?: RecentAuthentication) { return accountClosureStatus(userId, authentication ?? await proof()) }
async function close() { const authentication = await proof(); return closeOwnAccount(userId, (await review(authentication)).reviewVersion, authentication) }
beforeAll(async () => {
  const id = randomUUID()
  staffId = (await prisma.user.create({ data: { email: `closure-staff-${id}@example.test`, role: 'HEALER' } })).id
  healerId = (await prisma.healer.create({ data: { userId: staffId } })).id
  serviceId = (await prisma.service.create({ data: { slug: `closure-${id}`, name: 'Closure test service', category: 'Meditation', description: 'Isolated fixture', price: 10, duration: 30 } })).id
  planId = (await prisma.membershipPlan.create({ data: { slug: `closure-${id}`, title: 'Closure plan', pricePaise: 1000, interval: 'MONTHLY', razorpayPlanId: `fixture-${id}` } })).id
  programId = (await prisma.program.create({ data: { slug: `closure-${id}`, title: 'Closure program', description: 'Isolated fixture', pricePaise: 1000, totalSessions: 1, sessionsPerWeek: 1, durationMinutes: 30 } })).id
  courseId = (await prisma.course.create({ data: { slug: `closure-${id}`, title: 'Closure course', description: 'Isolated fixture', pricePaise: 1000 } })).id
  productId = (await prisma.product.create({ data: { slug: `closure-${id}`, title: 'Closure product', pricePaise: 1000 } })).id
})
beforeEach(async () => {
  jest.clearAllMocks()
  userId = (await prisma.user.create({ data: { email: `closure-${randomUUID()}@example.test`, password: 'isolated-preserved-hash', name: 'Owner', securityVersion: 5, vip: true, freeSessionCredits: 3 } })).id
})
afterEach(async () => {
  await prisma.activityLog.deleteMany({ where: { entityId: userId } })
  await prisma.verificationToken.deleteMany({ where: { identifier: { contains: userId } } })
  await prisma.user.delete({ where: { id: userId } })
})
afterAll(async () => {
  try {
    await prisma.user.delete({ where: { id: staffId } }); await prisma.service.delete({ where: { id: serviceId } })
    await prisma.membershipPlan.delete({ where: { id: planId } }); await prisma.program.delete({ where: { id: programId } })
    await prisma.course.delete({ where: { id: courseId } }); await prisma.product.delete({ where: { id: productId } })
  } finally { await prisma.$disconnect() }
})
test('closure retains all purchase/billing/credit/factor/OAuth history, revokes sessions/links and commits one audit', async () => {
  const before = await account(), now = new Date(), past = new Date(Date.now() - 7200_000)
  const booking = await prisma.booking.create({ data: { userId, healerId, serviceId, scheduledAt: past, durationMin: 30, status: 'COMPLETED', pricePaise: 1000 } })
  const payment = await prisma.payment.create({ data: { userId, bookingId: booking.id, gateway: 'razorpay', amountPaise: 1000, type: 'SESSION', status: 'success', statusEnum: 'SUCCESS' } })
  const invoice = await prisma.invoice.create({ data: { paymentId: payment.id, invoiceNumber: randomUUID(), billTo: { retained: true }, lineItems: [], subtotalPaise: 1000, totalPaise: 1000, pdfUrl: 'https://example.test/retained.pdf' } })
  const refund = await prisma.refund.create({ data: { paymentId: payment.id, amountPaise: 100, status: 'processed' } })
  const membership = await prisma.vIPMembership.create({ data: { userId, planId, subscriptionId: randomUUID(), status: 'cancelled', cancelledAt: now, endDate: now } })
  const ledger = await prisma.sessionCredit.create({ data: { userId, membershipId: membership.id, credits: 2, source: 'isolated-history' } })
  const enrollment = await prisma.programEnrollment.create({ data: { userId, programId, status: 'completed', pricePaise: 1000, endDate: past } })
  const programSession = await prisma.programSession.create({ data: { enrollmentId: enrollment.id, healerId, sessionNumber: 1, scheduledAt: past, durationMin: 30, status: 'COMPLETED', completedAt: past } })
  const course = await prisma.courseEnrollment.create({ data: { userId, courseId, status: 'active', pricePaise: 1000, progress: 50 } })
  const order = await prisma.order.create({ data: { userId, status: 'fulfilled', totalPaise: 1000, items: { create: { productId, quantity: 1, pricePaise: 1000 } } }, include: { items: true } })
  const oauth = await prisma.account.create({ data: { userId, type: 'oauth', provider: 'google', providerAccountId: randomUUID(), access_token: 'isolated-not-a-real-provider-token' } })
  const factor = await prisma.twoFactorCredential.create({ data: { userId, enabled: true, encryptedSecret: 'isolated-ciphertext', recoveryHashes: ['isolated-hash'] } })
  await prisma.session.create({ data: { userId, sessionToken: randomUUID(), expires: new Date(Date.now() + 60_000) } })
  await prisma.verificationToken.createMany({ data: ['password-reset', 'email-verification', 'unrelated-purpose'].map(prefix => ({ token: randomUUID(), identifier: `${prefix}:${userId}:fixture`, expires: new Date(Date.now() + 60_000) })) })
  const phone = await prisma.phoneVerification.create({ data: { userId, requestId: randomUUID(), phoneHash: 'isolated-hash', credentialVersion: 'isolated-version', providerId: `VE${'a'.repeat(32)}`, expiresAt: new Date(Date.now() + 60_000), nextSendAt: now, sendWindowStart: now, sendsInWindow: 3, attempts: 2, consentedAt: now } })
  const result = await close(), after = await account()
  expect(result).toMatchObject({ ownerId: userId, closed: true })
  expect(after).toEqual({ ...before, closedAt: new Date(result.closedAt), securityVersion: 6, updatedAt: after.updatedAt })
  for (const [actual, expected] of [
    [await prisma.booking.findUnique({ where: { id: booking.id } }), booking], [await prisma.payment.findUnique({ where: { id: payment.id } }), payment],
    [await prisma.invoice.findUnique({ where: { id: invoice.id } }), invoice], [await prisma.refund.findUnique({ where: { id: refund.id } }), refund],
    [await prisma.vIPMembership.findUnique({ where: { id: membership.id } }), membership], [await prisma.sessionCredit.findUnique({ where: { id: ledger.id } }), ledger],
    [await prisma.programEnrollment.findUnique({ where: { id: enrollment.id } }), enrollment], [await prisma.programSession.findUnique({ where: { id: programSession.id } }), programSession],
    [await prisma.courseEnrollment.findUnique({ where: { id: course.id } }), course], [await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } }), order],
    [await prisma.account.findUnique({ where: { id: oauth.id } }), oauth], [await prisma.twoFactorCredential.findUnique({ where: { userId } }), factor],
  ]) expect(actual).toEqual(expected)
  expect(await prisma.session.count({ where: { userId } })).toBe(0)
  expect(await prisma.verificationToken.count({ where: { identifier: { contains: userId } } })).toBe(1)
  expect(await prisma.phoneVerification.findUnique({ where: { userId } })).toEqual({ ...phone, providerId: null, expiresAt: new Date(result.closedAt), checkingId: null, checkingUntil: null, updatedAt: expect.any(Date) })
  expect(await prisma.activityLog.findMany({ where: { entityId: userId } })).toEqual([expect.objectContaining({ action: 'account_closed', userId, metadata: { method: 'self_service', retainedHistory: true } })])
})
test('concurrent confirmations close once and cannot replay or increment the session version twice', async () => {
  const authentication = await proof(), version = (await review(authentication)).reviewVersion
  const outcomes = await Promise.allSettled([closeOwnAccount(userId, version, authentication), closeOwnAccount(userId, version, authentication)])
  expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1)
  expect((outcomes.find(value => value.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 401 })
  expect((await account()).securityVersion).toBe(6)
  expect(await prisma.activityLog.count({ where: { entityId: userId } })).toBe(1)
})
test('old, forged, absent or other-owner authentication cannot close an account', async () => {
  const user = await account(), version = (await review()).reviewVersion
  for (const authentication of [undefined, await proof(Date.now() - 300_000), { issuedAt: Date.now(), proof: 'a'.repeat(64) }, createRecentAuthentication('another', sessionCredentialVersion(user.password, user.securityVersion))]) {
    await expect(closeOwnAccount(userId, version, authentication)).rejects.toMatchObject({ status: 403, code: 'REAUTHENTICATE' })
  }
  expect((await account()).closedAt).toBeNull()
})
test('profile edits require a fresh review and security changes require a new sign-in', async () => {
  const authentication = await proof(), version = (await review(authentication)).reviewVersion
  await prisma.user.update({ where: { id: userId }, data: { name: 'Newer saved name' } })
  await expect(closeOwnAccount(userId, version, authentication)).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_CHANGED' })
  const updated = await review(authentication)
  await prisma.user.update({ where: { id: userId }, data: { securityVersion: { increment: 1 } } })
  await expect(closeOwnAccount(userId, updated.reviewVersion, authentication)).rejects.toMatchObject({ status: 403, code: 'REAUTHENTICATE' })
  expect((await account()).closedAt).toBeNull()
})
test.each(['ADMIN', 'HEALER'] as const)('a current %s role cannot self-close', async role => {
  await prisma.user.update({ where: { id: userId }, data: { role } })
  expect((await review()).blockers).toEqual([expect.objectContaining({ code: 'STAFF' })])
  await expect(close()).rejects.toMatchObject({ status: 409, code: 'ACCOUNT_IN_USE' })
})
test('a practitioner record still blocks closure after a role-only change', async () => {
  await prisma.healer.create({ data: { userId, isActive: false } })
  expect((await review()).blockers).toEqual([expect.objectContaining({ code: 'STAFF' })])
})
test.each(['pending', 'active', 'paused', 'halted'] as const)('non-cancelled %s subscriptions require actual cancellation confirmation', async status => {
  await prisma.vIPMembership.create({ data: { userId, planId, subscriptionId: randomUUID(), status, endDate: new Date(0) } })
  expect((await review()).blockers).toEqual([expect.objectContaining({ code: 'MEMBERSHIPS' })])
  await expect(close()).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' })
})
test.each(['active', 'paused'] as const)('%s programs block closure without being silently cancelled', async status => {
  const program = await prisma.programEnrollment.create({ data: { userId, programId, status } })
  await expect(close()).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' })
  expect(await prisma.programEnrollment.findUnique({ where: { id: program.id } })).toEqual(program)
})
test('upcoming and ongoing bookings block closure; cancelled and ended sessions do not', async () => {
  const row = await prisma.booking.create({ data: { userId, healerId, serviceId, status: 'CONFIRMED', scheduledAt: new Date(Date.now() - 5 * 60_000), durationMin: 30, pricePaise: 1000 } })
  expect((await review()).blockers).toEqual([expect.objectContaining({ code: 'BOOKINGS' })])
  await prisma.booking.update({ where: { id: row.id }, data: { status: 'CANCELLED' } })
  const future = await prisma.booking.create({ data: { userId, healerId, serviceId, status: 'PENDING', scheduledAt: new Date(Date.now() + 3600_000), durationMin: 30, pricePaise: 1000 } })
  await expect(close()).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' })
  await prisma.booking.update({ where: { id: future.id }, data: { status: 'COMPLETED', scheduledAt: new Date(0) } })
  expect((await review()).blockers).toEqual([])
})
test('new open orders invalidate an earlier clear review; fulfillment is never fabricated by closure', async () => {
  const authentication = await proof(), version = (await review(authentication)).reviewVersion
  const order = await prisma.order.create({ data: { userId, totalPaise: 1000, status: 'paid' } })
  await expect(closeOwnAccount(userId, version, authentication)).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
  expect((await review()).blockers).toEqual([expect.objectContaining({ code: 'ORDERS' })])
  expect(await prisma.order.findUnique({ where: { id: order.id } })).toEqual(order)
})
test('shipped orders block closure until delivery, and delivered order history is retained', async () => {
  const order = await prisma.order.create({ data: { userId, totalPaise: 1000, status: 'shipped' } })
  const blocked = await review()
  expect(blocked.blockers).toEqual([expect.objectContaining({ code: 'ORDERS' })])
  await expect(close()).rejects.toMatchObject({ code: 'ACCOUNT_IN_USE' })
  const delivered = await prisma.order.update({ where: { id: order.id }, data: { status: 'delivered' } })
  await expect(closeOwnAccount(userId, blocked.reviewVersion, await proof())).rejects.toMatchObject({ code: 'ACCOUNT_CHANGED' })
  expect((await review()).blockers).toEqual([])
  await expect(close()).resolves.toMatchObject({ closed: true })
  expect(await prisma.order.findUnique({ where: { id: order.id } })).toEqual(delivered)
})
test('processing payments block closure while abandoned unpaid carts retain their saved records', async () => {
  const order = await prisma.order.create({ data: { userId, totalPaise: 1000 } })
  const payment = await prisma.payment.create({ data: { userId, gateway: 'razorpay', amountPaise: 1000, status: 'processing', statusEnum: 'PROCESSING' } })
  expect((await review()).blockers).toEqual([expect.objectContaining({ code: 'PAYMENTS' })])
  await prisma.payment.update({ where: { id: payment.id }, data: { status: 'failed', statusEnum: 'FAILED' } })
  await close()
  expect(await prisma.order.findUnique({ where: { id: order.id } })).toEqual(order)
})
test('closure rechecks current data after waiting behind an external account writer', async () => {
  const authentication = await proof(), version = (await review(authentication)).reviewVersion
  let release!: () => void, ready!: () => void
  const locked = new Promise<void>(done => { ready = done }), unlock = new Promise<void>(done => { release = done })
  const writer = prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { name: 'External saved name' } })
    await tx.order.create({ data: { userId, status: 'paid', totalPaise: 1000 } })
    ready(); await unlock
  }, { timeout: 15000 })
  await locked
  const pending = closeOwnAccount(userId, version, authentication).then(value => ({ value, error: null }), error => ({ value: null, error }))
  try {
    let waiting = false
    for (let n = 0; n < 100; n++) {
      const rows = await prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity a JOIN pg_locks l ON a.pid=l.pid WHERE a.datname=current_database() AND NOT l.granted AND a.query LIKE ${'%FOR UPDATE%'}) AS waiting`
      if (rows[0].waiting) { waiting = true; break }
      await new Promise(done => setTimeout(done, 20))
    }
    expect(waiting).toBe(true)
  } finally { release(); await writer; await pending }
  expect((await pending).error).toMatchObject({ status: 409, code: 'ACCOUNT_CHANGED' })
  expect((await account()).closedAt).toBeNull()
})
test('audit failure rolls back closure, session/link revocation and all other writes', async () => {
  const before = await account(), token = randomUUID(), constraint = `qa_closure_${randomUUID().replaceAll('-', '')}`
  const session = await prisma.session.create({ data: { userId, sessionToken: randomUUID(), expires: new Date(Date.now() + 60_000) } })
  await prisma.verificationToken.create({ data: { token, identifier: `password-reset:${userId}:fixture`, expires: new Date(Date.now() + 60_000) } })
  await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" ADD CONSTRAINT "${constraint}" CHECK ("entityId" <> '${userId}') NOT VALID`)
  try { await expect(close()).rejects.toThrow() }
  finally { await prisma.$executeRawUnsafe(`ALTER TABLE "ActivityLog" DROP CONSTRAINT "${constraint}"`) }
  expect(await account()).toEqual(before)
  expect(await prisma.session.findUnique({ where: { id: session.id } })).toEqual(session)
  expect(await prisma.verificationToken.findUnique({ where: { token } })).not.toBeNull()
})
test('recovery, verification, profile and factor operations cannot revive a closed account', async () => {
  await close()
  const user = await account(), token = 'b'.repeat(64), emailToken = 'c'.repeat(64)
  await prisma.verificationToken.createMany({ data: [
    { token: hash(token), identifier: `password-reset:${userId}:${passwordVersion(user.password)}:${hash(user.email)}`, expires: new Date(Date.now() + 60_000) },
    { token: hash(emailToken), identifier: `email-verification:${userId}:${hash(user.email)}:${user.securityVersion}`, expires: new Date(Date.now() + 60_000) },
  ] })
  await expect(confirmPasswordReset(token, 'New-Password-123!')).rejects.toThrow('invalid')
  await expect(confirmEmailVerification(emailToken)).rejects.toThrow('invalid')
  await requestPasswordReset(user.email, 'https://example.test', undefined)
  expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
  await expect(updateOwnProfile(userId, { name: 'Reopened' })).rejects.toMatchObject({ status: 404 })
  await expect(phoneVerificationStatus(userId)).rejects.toMatchObject({ status: 401 })
  await expect(requestPhoneVerification(userId, '+15555550101')).rejects.toMatchObject({ status: 401 })
  await expect(twoFactorStatus(userId)).rejects.toMatchObject({ status: 401 })
  expect(await verifyTwoFactorLogin({ userId, passwordHash: user.password!, securityVersion: user.securityVersion, code: '123456' })).toBe(false)
  expect(await account()).toEqual(user)
})
