import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { PasswordResetError, requestPasswordReset, resetPassword } from '@/lib/auth/password-reset'
import { POST as changePassword } from '@/app/api/users/me/password/route'

let mockUserId = ''
jest.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: mockUserId } }) }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { sendPasswordReset: jest.fn() } }))
let userId = ''
let email = ''
let originalHash = ''
const oldPassword = 'OriginalPassword!'

function deliveredToken(index = 0) {
  const link = new URL(jest.mocked(emailService.sendPasswordReset).mock.calls[index][0].resetUrl)
  return new URLSearchParams(link.hash.slice(1)).get('token')!
}
function savedTokens() { return prisma.verificationToken.findMany({ where: { identifier: { startsWith: `password-reset:${userId}:` } } }) }

beforeAll(async () => {
  email = `recovery-${randomUUID()}@example.test`
  originalHash = await bcrypt.hash(oldPassword, 4)
  userId = (await prisma.user.create({ data: { email, password: originalHash } })).id
})
beforeEach(async () => {
  mockUserId = userId
  await prisma.user.update({ where: { id: userId }, data: { email, password: originalHash, passwordChangedAt: null } })
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: `password-reset:${userId}:` } } })
  jest.mocked(emailService.sendPasswordReset).mockReset().mockResolvedValue({ success: true, id: 'test-delivery' })
})
afterAll(async () => {
  try {
    if (userId) {
      await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: `password-reset:${userId}:` } } })
      await prisma.user.delete({ where: { id: userId } })
    }
  } finally { await prisma.$disconnect() }
})

test('a delivered link is hashed, expiring and single-use; redemption saves a real password hash', async () => {
  await requestPasswordReset(email.toUpperCase(), 'https://ganges.example')
  const raw = deliveredToken()
  const [saved] = await savedTokens()
  expect(saved.token).not.toBe(raw)
  expect(saved.expires.getTime()).toBeGreaterThan(Date.now())
  await resetPassword(raw, 'NewRecoveryPassword!')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  expect(await bcrypt.compare('NewRecoveryPassword!', user.password!)).toBe(true)
  expect(await bcrypt.compare(oldPassword, user.password!)).toBe(false)
  expect(user.passwordChangedAt).toBeInstanceOf(Date)
  await expect(resetPassword(raw, 'ReplayedPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  expect(await savedTokens()).toHaveLength(0)
})

test('simultaneous requests send at most one email and retain one active token', async () => {
  await Promise.all(Array.from({ length: 4 }, () => requestPasswordReset(email, 'https://ganges.example')))
  expect(emailService.sendPasswordReset).toHaveBeenCalledTimes(1)
  expect(await savedTokens()).toHaveLength(1)
})

test('simultaneous redemptions cannot overwrite the winning password', async () => {
  await requestPasswordReset(email, 'https://ganges.example')
  const raw = deliveredToken()
  const passwords = ['ConcurrentPasswordA!', 'ConcurrentPasswordB!']
  const results = await Promise.allSettled(passwords.map(password => resetPassword(raw, password)))
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
  const winner = results.findIndex(result => result.status === 'fulfilled')
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  expect(await bcrypt.compare(passwords[winner], user.password!)).toBe(true)
  expect(await bcrypt.compare(passwords[1 - winner], user.password!)).toBe(false)
})

test('an expired link and a link to an older email identity cannot change the password', async () => {
  await requestPasswordReset(email, 'https://ganges.example')
  const raw = deliveredToken()
  const [saved] = await savedTokens()
  await prisma.verificationToken.update({ where: { token: saved.token }, data: { expires: new Date(0) } })
  await expect(resetPassword(raw, 'ExpiredPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  await prisma.verificationToken.update({ where: { token: saved.token }, data: { expires: new Date(Date.now() + 600000) } })
  await prisma.user.update({ where: { id: userId }, data: { email: `changed-${email}` } })
  await expect(resetPassword(raw, 'WrongIdentityPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).password).toBe(originalHash)
})

test('a fresh request after cooldown replaces the old link', async () => {
  await requestPasswordReset(email, 'https://ganges.example')
  const oldToken = deliveredToken()
  const [saved] = await savedTokens()
  await prisma.verificationToken.update({ where: { token: saved.token }, data: { expires: new Date(Date.now() + 900000 - 61000) } })
  await requestPasswordReset(email, 'https://ganges.example')
  expect(emailService.sendPasswordReset).toHaveBeenCalledTimes(2)
  expect(await savedTokens()).toHaveLength(1)
  await expect(resetPassword(oldToken, 'OlderLinkPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  await resetPassword(deliveredToken(1), 'FreshLinkPassword!')
})

test('changing the current password also revokes outstanding recovery links', async () => {
  await requestPasswordReset(email, 'https://ganges.example')
  const raw = deliveredToken()
  const response = await changePassword(new Request('http://localhost/api/users/me/password', {
    method: 'POST', body: JSON.stringify({ currentPassword: oldPassword, newPassword: 'SettingsPassword!' }),
  }))
  expect(response.status).toBe(200)
  expect(await savedTokens()).toHaveLength(0)
  await expect(resetPassword(raw, 'OldResetPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  expect(user.passwordChangedAt).not.toBeNull()
  expect(await bcrypt.compare('SettingsPassword!', user.password!)).toBe(true)
})
