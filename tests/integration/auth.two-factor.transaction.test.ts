import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { GET, POST } from '@/app/api/users/me/two-factor/route'
import { generateAuthenticatorCode, matchingRecoveryCode } from '@/lib/auth/two-factor-crypto'
import { verifyTwoFactorLogin } from '@/lib/auth/two-factor'
let mockActor = ''
jest.mock('@/lib/auth', () => ({ auth: async () => mockActor ? { user: { id: mockActor } } : null }))
const password = 'Owner-Password-123!'
const users: string[] = []
async function account() {
  const user = await prisma.user.create({ data: { email: `mfa-${randomUUID()}@example.test`, password: await bcrypt.hash(password, 8) } }); users.push(user.id); mockActor = user.id; return user
}
function action(body: unknown, origin?: string) { return POST(new Request('http://localhost/api/users/me/two-factor', { method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) })) }
async function enable() {
  const user = await account()
  const setupResponse = await action({ action: 'begin', password }); expect(setupResponse.status).toBe(200)
  const setup = await setupResponse.json()
  const activationCode = generateAuthenticatorCode(setup.secret)
  const res = await action({ action: 'enable', password, code: activationCode }); expect(res.status).toBe(200)
  return { user, setup, activationCode, enabled: await res.json() }
}
afterAll(async () => { try { await prisma.user.deleteMany({ where: { id: { in: users } } }) } finally { await prisma.$disconnect() } })
test('owner setup stores only encrypted data; activation requires a code and status never returns secrets', async () => {
  const user = await account()
  const setup = await (await action({ action: 'begin', password })).json()
  const stored = await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId: user.id } })
  expect(stored.enabled).toBe(false); expect(stored.pendingEncryptedSecret).not.toContain(setup.secret)
  expect((await action({ action: 'enable', password, code: 'not-a-code' })).status).toBe(400)
  const enabled = await action({ action: 'enable', password, code: generateAuthenticatorCode(setup.secret) })
  expect(enabled.status).toBe(200)
  const body = await enabled.json(); expect(body.recoveryCodes).toHaveLength(8)
  const status = await GET(); expect(status.headers.get('cache-control')).toBe('private, no-store')
  const publicStatus = await status.json(); expect(publicStatus).toEqual({ enabled: true, hasPassword: true, recoveryCodesRemaining: 8 })
  expect(JSON.stringify(publicStatus)).not.toContain(setup.secret)
  const actual = await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId: user.id } })
  expect(actual.encryptedSecret).not.toContain(setup.secret); expect(actual.pendingEncryptedSecret).toBeNull()
  expect(actual.recoveryHashes).not.toEqual(body.recoveryCodes)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).securityVersion).toBe(1)
})
test('TOTP replay and concurrent use are refused across requests', async () => {
  const { user, setup, activationCode } = await enable()
  const same = activationCode
  const input = { userId: user.id, passwordHash: user.password!, securityVersion: 1, code: same }
  expect(await verifyTwoFactorLogin(input)).toBe(false)
  const saved = await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId: user.id } })
  const next = { ...input, code: generateAuthenticatorCode(setup.secret, Number(saved.lastAcceptedStep! + BigInt(1)) * 30000) }
  const results = await Promise.all([verifyTwoFactorLogin(next), verifyTwoFactorLogin(next)])
  expect(results.sort()).toEqual([false, true])
})
test('a recovery code works once under concurrent login and cannot authenticate another account', async () => {
  const { user, enabled } = await enable()
  const input = { userId: user.id, passwordHash: user.password!, securityVersion: 1, code: enabled.recoveryCodes[0] }
  const results = await Promise.all([verifyTwoFactorLogin(input), verifyTwoFactorLogin(input)])
  expect(results.sort()).toEqual([false, true])
  expect((await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId: user.id } })).recoveryHashes).toHaveLength(7)
  const other = await enable()
  expect(await verifyTwoFactorLogin({ userId: other.user.id, passwordHash: other.user.password!, securityVersion: 1, code: enabled.recoveryCodes[1] })).toBe(false)
})
test('five failed password/factor attempts trigger the durable account throttle', async () => {
  const user = await account()
  for (let n = 0; n < 5; n++) expect((await action({ action: 'begin', password: 'incorrect' })).status).toBe(400)
  const blocked = await action({ action: 'begin', password })
  expect(blocked.status).toBe(429); expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
  expect((await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId: user.id } })).failedAttempts).toBe(5)
})
test('expired setup and a password change invalidate the pending key', async () => {
  const user = await account()
  const setup = await (await action({ action: 'begin', password })).json()
  await prisma.twoFactorCredential.update({ where: { userId: user.id }, data: { pendingExpiresAt: new Date(Date.now() - 1) } })
  expect((await action({ action: 'enable', password, code: generateAuthenticatorCode(setup.secret) })).status).toBe(409)
  const replacement = await (await action({ action: 'begin', password })).json()
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash('Changed-Password-123!', 8) } })
  expect((await action({ action: 'enable', password: 'Changed-Password-123!', code: generateAuthenticatorCode(replacement.secret) })).status).toBe(409)
})
test('disabling requires a factor and increments the session version without resurrecting old versions', async () => {
  const { user, enabled } = await enable()
  expect((await action({ action: 'disable', password, code: 'wrong' })).status).toBe(400)
  const disabled = await action({ action: 'disable', password, code: enabled.recoveryCodes[0] })
  expect(disabled.status).toBe(200); expect((await disabled.json()).enabled).toBe(false)
  expect(await prisma.twoFactorCredential.findUnique({ where: { userId: user.id } })).toBeNull()
  expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).securityVersion).toBe(2)
  expect(await verifyTwoFactorLogin({ userId: user.id, passwordHash: user.password!, securityVersion: 1, code: enabled.recoveryCodes[1] })).toBe(false)
})
test('replacement recovery codes invalidate all old ones and remain hashed', async () => {
  const { user, enabled } = await enable()
  const replacement = await action({ action: 'recovery', password, code: enabled.recoveryCodes[0] })
  expect(replacement.status).toBe(200)
  const body = await replacement.json()
  const row = await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId: user.id } })
  expect(body.recoveryCodes).toHaveLength(8)
  expect(matchingRecoveryCode(user.id, enabled.recoveryCodes[1], row.recoveryHashes)).toBe(-1)
  expect(matchingRecoveryCode(user.id, body.recoveryCodes[0], row.recoveryHashes)).toBe(0)
})
test('current-password checks and account scoping prevent setup, cancellation or action injection by another session', async () => {
  const user = await account()
  expect((await action({ action: 'begin', password, userId: 'another-user' })).status).toBe(400)
  expect((await action({ action: 'begin', password }, 'https://untrusted.example')).status).toBe(403)
  expect(await prisma.twoFactorCredential.findUnique({ where: { userId: user.id } })).toBeNull()
  const setup = await (await action({ action: 'begin', password })).json()
  const cancelled = await action({ action: 'cancel', password }); expect(cancelled.status).toBe(200)
  expect((await action({ action: 'enable', password, code: generateAuthenticatorCode(setup.secret) })).status).toBe(409)
  mockActor = ''
  expect((await GET()).status).toBe(401)
})
test('a configured key rotation cannot decrypt the old secret, but a saved recovery code still works', async () => {
  const { user, setup, enabled } = await enable()
  const original = process.env.AUTH_SECRET
  process.env.AUTH_SECRET = 'replacement-configuration-key-for-isolated-test'
  try {
    expect(await verifyTwoFactorLogin({ userId: user.id, passwordHash: user.password!, securityVersion: 1, code: generateAuthenticatorCode(setup.secret, Date.now() + 30000) })).toBe(false)
    expect(await verifyTwoFactorLogin({ userId: user.id, passwordHash: user.password!, securityVersion: 1, code: enabled.recoveryCodes[0] })).toBe(true)
  } finally { if (original === undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET = original }
})
