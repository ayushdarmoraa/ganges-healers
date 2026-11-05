import { createHash, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { confirmPasswordReset, PasswordResetError, requestPasswordReset } from '@/lib/auth/password-reset'
import { passwordVersion } from '@/lib/auth/password-version'
import { emailService } from '@/lib/email/email.service'

jest.mock('@/lib/email/email.service', () => ({ emailService: { sendPasswordReset: jest.fn(async () => ({ success: true })) } }))
let userId = ''
let email = ''
let originalHash = ''
async function link(expires = new Date(Date.now() + 60_000)) {
  const token = randomBytes(32).toString('hex')
  const stored = createHash('sha256').update(token).digest('hex')
  await prisma.verificationToken.create({ data: { token: stored, identifier: `password-reset:${userId}:${passwordVersion(originalHash)}:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`, expires } })
  return token
}
beforeEach(async () => {
  jest.clearAllMocks()
  email = `password-recovery-${randomUUID()}@example.test`
  originalHash = await bcrypt.hash('OriginalPassword123!', 4)
  userId = (await prisma.user.create({ data: { email, password: originalHash } })).id
})
afterEach(async () => {
  if (!userId) return
  await prisma.verificationToken.deleteMany({ where: { OR: [{ identifier: { startsWith: `password-reset:${userId}:` } }, { identifier: `password-reset-rate:${userId}` }] } })
  await prisma.user.delete({ where: { id: userId } })
  userId = ''
})
afterAll(async () => { await prisma.$disconnect() })

test('concurrent requests send one email with a hashed, short-lived, single-use link', async () => {
  await Promise.all([requestPasswordReset(email, 'https://example.test', '/dashboard'), requestPasswordReset(email, 'https://example.test', '/dashboard')])
  expect(emailService.sendPasswordReset).toHaveBeenCalledTimes(1)
  const sent = jest.mocked(emailService.sendPasswordReset).mock.calls[0][0]
  const token = new URLSearchParams(new URL(sent.link).hash.slice(1)).get('token')!
  expect(await prisma.verificationToken.findUnique({ where: { token } })).toBeNull()
  const saved = await prisma.verificationToken.findUniqueOrThrow({ where: { token: createHash('sha256').update(token).digest('hex') } })
  expect(saved.identifier).toBe(`password-reset:${userId}:${passwordVersion(originalHash)}:${createHash('sha256').update(email.toLowerCase()).digest('hex')}`)
  expect(saved.expires.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000)
})

test('only one concurrent confirmation wins and all other recovery links and stored sessions are revoked', async () => {
  const [first, second] = await Promise.all([link(), link()])
  await prisma.session.create({ data: { userId, sessionToken: `synthetic-${randomUUID()}`, expires: new Date(Date.now() + 60_000) } })
  const outcomes = await Promise.allSettled([confirmPasswordReset(first, 'ReplacementOne123!'), confirmPasswordReset(second, 'ReplacementTwo123!')])
  expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
  const rejected = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult
  expect(rejected.reason).toBeInstanceOf(PasswordResetError)
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  expect(saved.password).not.toBe(originalHash)
  expect(await bcrypt.compare(outcomes[0].status === 'fulfilled' ? 'ReplacementOne123!' : 'ReplacementTwo123!', saved.password!)).toBe(true)
  expect(await prisma.verificationToken.count({ where: { identifier: { startsWith: `password-reset:${userId}:` } } })).toBe(0)
  expect(await prisma.session.count({ where: { userId } })).toBe(0)
  await expect(confirmPasswordReset(first, 'ReplayedPassword123!')).rejects.toBeInstanceOf(PasswordResetError)
})

test('expired links leave the original credential intact', async () => {
  const token = await link(new Date(0))
  await expect(confirmPasswordReset(token, 'Replacement123!')).rejects.toBeInstanceOf(PasswordResetError)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).password).toBe(originalHash)
})

test('changing the account email invalidates a previously issued link', async () => {
  const token = await link()
  await prisma.user.update({ where: { id: userId }, data: { email: `changed-${email}` } })
  await expect(confirmPasswordReset(token, 'Replacement123!')).rejects.toBeInstanceOf(PasswordResetError)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).password).toBe(originalHash)
})

test('failed delivery can be retried immediately and does not leave an active reset link', async () => {
  jest.mocked(emailService.sendPasswordReset).mockResolvedValueOnce({ success: false })
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await requestPasswordReset(email, 'https://example.test', '/dashboard')
    expect(await prisma.verificationToken.count({ where: { OR: [{ identifier: { startsWith: `password-reset:${userId}:` } }, { identifier: `password-reset-rate:${userId}` }] } })).toBe(0)
    await requestPasswordReset(email, 'https://example.test', '/dashboard')
    expect(emailService.sendPasswordReset).toHaveBeenCalledTimes(2)
    expect(await prisma.verificationToken.count({ where: { identifier: { startsWith: `password-reset:${userId}:` } } })).toBe(1)
  } finally { log.mockRestore() }
})

test('case-insensitive collisions in older accounts never select a reset recipient', async () => {
  const duplicate = await prisma.user.create({ data: { email: email.toUpperCase(), password: originalHash } })
  try {
    await requestPasswordReset(email, 'https://example.test', '/dashboard')
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
    expect(await prisma.verificationToken.count({ where: { identifier: { startsWith: `password-reset:${userId}:` } } })).toBe(0)
  } finally { await prisma.user.delete({ where: { id: duplicate.id } }) }
})
