import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { confirmEmailVerification, EmailVerificationError, requestEmailVerification } from '@/lib/auth/email-verification'

jest.mock('@/lib/email/email.service', () => ({ emailService: { sendEmailVerification: jest.fn(async () => ({ success: true })) } }))
let userId = '', email = ''
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
async function link(expires = new Date(Date.now() + 60_000)) {
  const token = randomBytes(32).toString('hex')
  await prisma.verificationToken.create({ data: { token: hash(token), identifier: `email-verification:${userId}:${hash(email.toLowerCase())}:3`, expires } })
  return token
}
beforeEach(async () => {
  jest.clearAllMocks()
  jest.mocked(emailService.sendEmailVerification).mockResolvedValue({ success: true })
  email = `verify-${randomUUID()}@example.test`
  userId = (await prisma.user.create({ data: { email, password: 'synthetic-unchanged-password-hash', securityVersion: 3, role: 'USER' } })).id
})
afterEach(async () => {
  if (!userId) return
  await prisma.verificationToken.deleteMany({ where: { OR: [{ identifier: { startsWith: `email-verification:${userId}:` } }, { identifier: `email-verification-rate:${userId}` }] } })
  await prisma.user.delete({ where: { id: userId } })
  userId = ''
})
afterAll(async () => { await prisma.$disconnect() })

test('concurrent requests share one durable delivery cooldown and store only a token hash', async () => {
  await Promise.all([requestEmailVerification(userId, email, 'https://example.test'), requestEmailVerification(userId, email, 'https://example.test')])
  expect(emailService.sendEmailVerification).toHaveBeenCalledTimes(1)
  const sent = jest.mocked(emailService.sendEmailVerification).mock.calls[0][0]
  const token = new URLSearchParams(new URL(sent.link).hash.slice(1)).get('token')!
  expect(await prisma.verificationToken.findUnique({ where: { token } })).toBeNull()
  const saved = await prisma.verificationToken.findUniqueOrThrow({ where: { token: hash(token) } })
  expect(saved.identifier).toBe(`email-verification:${userId}:${hash(email)}:3`)
  expect(saved.expires.getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000)
})

test('concurrent confirmation consumes one link and cannot change password, role or security version', async () => {
  const token = await link()
  const outcomes = await Promise.allSettled([confirmEmailVerification(token), confirmEmailVerification(token)])
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
  expect((outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult).reason).toBeInstanceOf(EmailVerificationError)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  expect(user.emailVerified).toBeInstanceOf(Date)
  expect(user).toMatchObject({ password: 'synthetic-unchanged-password-hash', role: 'USER', securityVersion: 3 })
  expect(await prisma.verificationToken.count({ where: { identifier: { startsWith: `email-verification:${userId}:` } } })).toBe(0)
})

test('email changes, factor changes and expired links cannot confirm a stale address', async () => {
  const token = await link()
  await prisma.user.update({ where: { id: userId }, data: { email: `changed-${randomUUID()}@example.test` } })
  await expect(confirmEmailVerification(token)).rejects.toBeInstanceOf(EmailVerificationError)
  await prisma.user.update({ where: { id: userId }, data: { email, securityVersion: 4 } })
  await expect(confirmEmailVerification(token)).rejects.toBeInstanceOf(EmailVerificationError)
  await prisma.user.update({ where: { id: userId }, data: { securityVersion: 3 } })
  const expired = await link(new Date(0))
  await expect(confirmEmailVerification(expired)).rejects.toBeInstanceOf(EmailVerificationError)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified).toBeNull()
})

test('an already verified account does not send another link', async () => {
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } })
  await requestEmailVerification(userId, email, 'https://example.test')
  expect(emailService.sendEmailVerification).not.toHaveBeenCalled()
})

test('email confirmation preserves enabled authenticators and their one-use recovery codes', async () => {
  await prisma.twoFactorCredential.create({ data: { userId, enabled: true, encryptedSecret: 'synthetic-preserved-ciphertext', recoveryHashes: ['synthetic-preserved-recovery-hash'] } })
  await confirmEmailVerification(await link())
  expect(await prisma.twoFactorCredential.findUniqueOrThrow({ where: { userId } })).toMatchObject({ enabled: true, encryptedSecret: 'synthetic-preserved-ciphertext', recoveryHashes: ['synthetic-preserved-recovery-hash'] })
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).securityVersion).toBe(3)
})

test('failed delivery releases its reservation and permits a successful retry', async () => {
  jest.mocked(emailService.sendEmailVerification).mockResolvedValueOnce({ success: false })
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await requestEmailVerification(userId, email, 'https://example.test')
    expect(await prisma.verificationToken.count({ where: { identifier: `email-verification-rate:${userId}` } })).toBe(0)
    await requestEmailVerification(userId, email, 'https://example.test')
    expect(emailService.sendEmailVerification).toHaveBeenCalledTimes(2)
    const sent = jest.mocked(emailService.sendEmailVerification).mock.calls[1][0]
    await confirmEmailVerification(new URLSearchParams(new URL(sent.link).hash.slice(1)).get('token')!)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified).not.toBeNull()
  } finally { log.mockRestore() }
})
