import { createHash, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { phoneSms, SmsVerificationError } from '@/lib/auth/phone-sms'
import { confirmPhoneVerification, phoneVerificationStatus, requestPhoneVerification } from '@/lib/auth/phone-verification'
import { profileVersion, updateOwnProfile } from '@/lib/users/profile'

jest.mock('@/lib/auth/phone-sms', () => ({ ...jest.requireActual('@/lib/auth/phone-sms'), phoneSms: { available: jest.fn(), request: jest.fn(), check: jest.fn() } }))
const sms = jest.mocked(phoneSms), sid = `VE${'a'.repeat(32)}`
let userId = '', phone = '', sequence = 0
const current = () => prisma.user.findUniqueOrThrow({ where: { id: userId } })
const state = () => prisma.phoneVerification.findUniqueOrThrow({ where: { userId } })
async function start() { return (await requestPhoneVerification(userId, phone)).challenge!.id }
async function confirm(id: string) { return confirmPhoneVerification(userId, phone, id, '123456') }
beforeEach(async () => {
  jest.clearAllMocks(); sms.available.mockReturnValue(true); sms.request.mockResolvedValue(sid); sms.check.mockResolvedValue('approved')
  phone = `+1555555${String(++sequence).padStart(4, '0')}`
  userId = (await prisma.user.create({ data: { email: `phone-${randomUUID()}@example.test`, name: 'Original', phone, password: 'preserved-credential', securityVersion: 3, freeSessionCredits: 7 } })).id
})
afterEach(async () => { if (userId) await prisma.user.delete({ where: { id: userId } }) })
afterAll(async () => { await prisma.$disconnect() })

test('parallel sends reserve one durable request and never mark a phone verified from acceptance', async () => {
  const outcomes = await Promise.allSettled([requestPhoneVerification(userId, phone), requestPhoneVerification(userId, phone)])
  expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1)
  expect((outcomes.find(value => value.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 429 })
  expect(sms.request).toHaveBeenCalledTimes(1)
  expect(await state()).toMatchObject({ sendsInWindow: 1, attempts: 0, providerId: sid, phoneHash: createHash('sha256').update(phone).digest('hex'), consentedAt: expect.any(Date) })
  expect(await phoneVerificationStatus(userId)).toMatchObject({ verifiedAt: null, challenge: { id: expect.any(String) } })
})
test('a send cooldown and hourly account budget survive number changes and resends', async () => {
  const old = await start()
  await expect(start()).rejects.toMatchObject({ status: 429, retryAfter: expect.any(Number) })
  for (let n = 0; n < 2; n++) { await prisma.phoneVerification.update({ where: { userId }, data: { nextSendAt: new Date(0) } }); await start() }
  expect((await state()).sendsInWindow).toBe(3)
  await expect(confirm(old)).rejects.toMatchObject({ status: 400 })
  await prisma.phoneVerification.update({ where: { userId }, data: { nextSendAt: new Date(0) } })
  phone = '+15555550199'; await updateOwnProfile(userId, { phone })
  await expect(start()).rejects.toMatchObject({ status: 429 })
  expect(sms.request).toHaveBeenCalledTimes(3); expect(sms.check).not.toHaveBeenCalled()
  await prisma.phoneVerification.update({ where: { userId }, data: { sendWindowStart: new Date(Date.now() - 2 * 60 * 60_000) } })
  await start()
  expect((await state()).sendsInWindow).toBe(1)
})
test('approved confirmation is one-use and preserves credentials, roles, credits and enabled MFA', async () => {
  await prisma.twoFactorCredential.create({ data: { userId, enabled: true, encryptedSecret: 'preserved-synthetic-secret', recoveryHashes: ['preserved-synthetic-recovery'] } })
  const before = await current(), factor = await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId } }), id = await start()
  const outcomes = await Promise.allSettled([confirm(id), confirm(id)])
  expect(outcomes.filter(value => value.status === 'fulfilled')).toHaveLength(1)
  expect(sms.check).toHaveBeenCalledTimes(1)
  const saved = await current()
  expect(saved).toEqual({ ...before, phoneVerifiedAt: expect.any(Date), phoneVerifiedHash: createHash('sha256').update(phone).digest('hex'), updatedAt: saved.updatedAt })
  expect(profileVersion(saved)).toBe(profileVersion(before))
  expect(await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId } })).toEqual(factor)
  await expect(confirm(id)).rejects.toMatchObject({ status: 400 })
})
test('wrong codes have bounded attempts and a correct retry can still verify', async () => {
  const id = await start()
  sms.check.mockResolvedValueOnce('invalid').mockResolvedValueOnce('approved')
  await expect(confirm(id)).rejects.toMatchObject({ status: 400 })
  expect(await state()).toMatchObject({ attempts: 1, checkingId: null, providerId: sid })
  expect((await current()).phoneVerifiedAt).toBeNull()
  expect((await confirm(id)).verifiedAt).not.toBeNull()
  expect((await state()).attempts).toBe(2)
})
test('five failed checks exhaust a challenge without allowing further provider guesses', async () => {
  const id = await start(); sms.check.mockResolvedValue('invalid')
  for (let n = 0; n < 6; n++) await expect(confirm(id)).rejects.toMatchObject({ status: 400 })
  expect(sms.check).toHaveBeenCalledTimes(5)
  expect((await state()).attempts).toBe(5)
  expect((await phoneVerificationStatus(userId)).challenge).toBeNull()
})
test('expiry and changed password/factor versions reject a code before provider access', async () => {
  const id = await start()
  await prisma.phoneVerification.update({ where: { userId }, data: { expiresAt: new Date(0) } })
  await expect(confirm(id)).rejects.toMatchObject({ status: 400 })
  await prisma.phoneVerification.update({ where: { userId }, data: { expiresAt: new Date(Date.now() + 60_000) } })
  await prisma.user.update({ where: { id: userId }, data: { password: 'new-credential' } })
  await expect(confirm(id)).rejects.toMatchObject({ status: 400 })
  await prisma.user.update({ where: { id: userId }, data: { password: 'preserved-credential', securityVersion: 4 } })
  await expect(confirm(id)).rejects.toMatchObject({ status: 400 })
  expect(sms.check).not.toHaveBeenCalled()
})
test('changing the saved phone clears proof and changing it back does not restore old verification', async () => {
  await confirm(await start())
  const number = phone
  await updateOwnProfile(userId, { name: 'Updated name' })
  expect((await phoneVerificationStatus(userId)).verifiedAt).not.toBeNull()
  await updateOwnProfile(userId, { phone: '+15555550198' })
  expect(await current()).toMatchObject({ phoneVerifiedAt: null, phoneVerifiedHash: null })
  await updateOwnProfile(userId, { phone: number })
  expect((await phoneVerificationStatus(userId)).verifiedAt).toBeNull()
})
test('provider failures keep the shared cost budget but do not claim delivery or verification', async () => {
  sms.request.mockRejectedValue(new Error('private-provider-credential'))
  await expect(start()).rejects.toMatchObject({ status: 503, code: 'SMS_UNAVAILABLE' })
  expect(await state()).toMatchObject({ providerId: null, sendsInWindow: 1 })
  await expect(start()).rejects.toMatchObject({ status: 429 })
  expect(sms.request).toHaveBeenCalledTimes(1)
  expect(await phoneVerificationStatus(userId)).toMatchObject({ verifiedAt: null, challenge: null })
})
test('failed checks release their lease for retry and expired provider challenges cannot replay', async () => {
  const id = await start()
  sms.check.mockRejectedValueOnce(new SmsVerificationError()).mockResolvedValueOnce('expired')
  await expect(confirm(id)).rejects.toMatchObject({ status: 503 })
  expect((await state()).checkingId).toBeNull()
  await expect(confirm(id)).rejects.toMatchObject({ status: 400 })
  await expect(confirm(id)).rejects.toMatchObject({ status: 400 })
  expect(sms.check).toHaveBeenCalledTimes(2)
})
test('provider network calls run after the account transaction lock has been released', async () => {
  async function assertUnlocked() {
    const rows = await prisma.$queryRaw<Array<{ held: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND granted AND classid=72108::oid AND objid=(hashtext(${userId})::bigint & 4294967295)::oid) AS held`
    expect(rows[0].held).toBe(false)
  }
  sms.request.mockImplementation(async () => { await assertUnlocked(); return sid })
  sms.check.mockImplementation(async () => { await assertUnlocked(); return 'approved' })
  expect((await confirm(await start())).verifiedAt).not.toBeNull()
})
test('a delayed old send cannot overwrite a newer request', async () => {
  let arrived!: () => void, reply!: (sid: string) => void
  const started = new Promise<void>(resolve => { arrived = resolve })
  sms.request.mockImplementationOnce(() => { arrived(); return new Promise(resolve => { reply = resolve }) }).mockResolvedValue(`VE${'b'.repeat(32)}`)
  const old = start().then(value => ({ value, error: null }), error => ({ value: null, error }))
  await started
  await prisma.phoneVerification.update({ where: { userId }, data: { nextSendAt: new Date(0) } })
  const fresh = await start()
  reply(sid)
  expect((await old).error).toMatchObject({ status: 409 })
  expect(await state()).toMatchObject({ requestId: fresh, providerId: `VE${'b'.repeat(32)}` })
})
test('a phone edit while approval is in flight cannot verify the new number', async () => {
  const id = await start()
  let arrived!: () => void, reply!: (value: 'approved') => void
  const started = new Promise<void>(resolve => { arrived = resolve })
  sms.check.mockImplementationOnce(() => { arrived(); return new Promise(resolve => { reply = resolve }) })
  const pending = confirm(id).then(value => ({ value, error: null }), error => ({ value: null, error }))
  await started
  await updateOwnProfile(userId, { phone: '+15555550197' })
  reply('approved')
  expect((await pending).error).toMatchObject({ status: 409 })
  expect(await current()).toMatchObject({ phone: '+15555550197', phoneVerifiedAt: null, phoneVerifiedHash: null })
})
test('missing configuration, local-only numbers and stale snapshots never send an SMS', async () => {
  sms.available.mockReturnValue(false)
  await expect(start()).rejects.toMatchObject({ status: 503 })
  expect(await prisma.phoneVerification.count({ where: { userId } })).toBe(0)
  sms.available.mockReturnValue(true)
  await expect(requestPhoneVerification(userId, '+15555550196')).rejects.toMatchObject({ status: 409 })
  await updateOwnProfile(userId, { phone: '9876543210' })
  await expect(requestPhoneVerification(userId, '9876543210')).rejects.toMatchObject({ code: 'PHONE_FORMAT' })
  expect(sms.request).not.toHaveBeenCalled()
})
