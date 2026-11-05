import { createHash } from 'node:crypto'
import { after } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { passwordResetOrigin, PasswordResetError, requestPasswordReset, resetPassword } from '@/lib/auth/password-reset'
import { POST as forgot } from '@/app/api/auth/forgot-password/route'
import { POST as applyReset } from '@/app/api/auth/reset-password/route'
import { POST as changePassword } from '@/app/api/users/me/password/route'
import { auth } from '@/lib/auth'

jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: jest.fn() }))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { isEnabled: jest.fn(), sendPasswordReset: jest.fn() } }))
jest.mock('bcryptjs', () => ({ __esModule: true, default: { hash: jest.fn(), compare: jest.fn() } }))
jest.mock('@/lib/prisma', () => ({ prisma: {
  user: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  verificationToken: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
  $transaction: jest.fn(), $executeRaw: jest.fn(),
} }))

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const token = 'a'.repeat(64)
const customer = { id: 'customer', email: 'customer@example.test', password: 'original-hash' }
const identifier = `password-reset:${customer.id}:${hash(customer.email)}`
function request(body: unknown) { return new Request('https://attacker.invalid/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }) }
function validCandidate() { return { identifier, token: hash(token), expires: new Date(Date.now() + 900000) } }

beforeEach(() => {
  jest.resetAllMocks()
  jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'test', NEXT_PUBLIC_SITE_URL: 'https://ganges.example' })
  ;(prisma.$transaction as jest.Mock).mockImplementation((work: (tx: typeof prisma) => Promise<unknown>) => work(prisma))
  jest.mocked(prisma.user.findMany).mockResolvedValue([customer as never])
  jest.mocked(prisma.user.findUnique).mockResolvedValue(customer as never)
  jest.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 })
  jest.mocked(prisma.verificationToken.findFirst).mockResolvedValue(null)
  jest.mocked(prisma.verificationToken.findUnique).mockResolvedValue(validCandidate())
  jest.mocked(prisma.verificationToken.deleteMany).mockResolvedValue({ count: 1 })
  jest.mocked(emailService.isEnabled).mockReturnValue(true)
  jest.mocked(emailService.sendPasswordReset).mockResolvedValue({ success: true, id: 'email' })
  jest.mocked(bcrypt.hash).mockImplementation(async () => 'new-hash')
  jest.mocked(bcrypt.compare).mockImplementation(async () => true)
  jest.mocked(auth).mockResolvedValue({ user: { id: customer.id } } as never)
})
afterEach(() => jest.restoreAllMocks())

test.each([
  [{ NEXT_PUBLIC_SITE_URL: 'https://ganges.example/path' }, 'https://ganges.example'],
  [{ NODE_ENV: 'development', NEXTAUTH_URL: 'http://localhost:3010' }, 'http://localhost:3010'],
  [{ NODE_ENV: 'production', NEXTAUTH_URL: 'http://localhost:3010' }, null],
  [{ NEXT_PUBLIC_SITE_URL: 'http://attacker.invalid' }, null],
  [{ NEXT_PUBLIC_SITE_URL: 'https://user:secret@ganges.example' }, null],
  [{ NEXT_PUBLIC_SITE_URL: 'not-a-url' }, null],
  [{}, null],
])('uses only a configured safe origin: %j', (environment, expected) => {
  expect(passwordResetOrigin(environment)).toBe(expected)
})

test('stores only a token digest, binds the account and preserves a safe journey in the email link', async () => {
  await requestPasswordReset(' CUSTOMER@EXAMPLE.TEST ', 'https://ganges.example', '/services/reiki?healerId=chosen')
  expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: customer.email, mode: 'insensitive' } }, take: 2 }))
  const sent = jest.mocked(emailService.sendPasswordReset).mock.calls[0][0]
  const link = new URL(sent.resetUrl)
  const raw = new URLSearchParams(link.hash.slice(1)).get('token')!
  expect(raw).toMatch(/^[a-f0-9]{64}$/)
  expect(link.origin).toBe('https://ganges.example')
  expect(link.pathname).toBe('/auth/reset-password')
  expect(link.searchParams.has('token')).toBe(false)
  expect(link.searchParams.get('callbackUrl')).toBe('/services/reiki?healerId=chosen')
  expect(sent.to).toBe(customer.email)
  expect(prisma.verificationToken.create).toHaveBeenCalledWith({ data: { identifier, token: hash(raw), expires: expect.any(Date) } })
  expect(hash(raw)).not.toBe(raw)
  const expiry = jest.mocked(prisma.verificationToken.create).mock.calls[0][0].data.expires as Date
  expect(expiry.getTime() - Date.now()).toBeGreaterThan(890000)
})

test.each([{ rows: [] }, { rows: [{ ...customer, password: null }] }, { rows: [customer, { ...customer, id: 'ambiguous' }] }])('does not issue a link for unknown, OAuth-only or ambiguous accounts', async ({ rows }) => {
  jest.mocked(prisma.user.findMany).mockResolvedValue(rows as never)
  await requestPasswordReset(customer.email, 'https://ganges.example')
  expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
  expect(prisma.$transaction).not.toHaveBeenCalled()
})

test('keeps the active token and suppresses repeated delivery during the per-account cooldown', async () => {
  jest.mocked(prisma.verificationToken.findFirst).mockResolvedValue(validCandidate())
  await requestPasswordReset(customer.email, 'https://ganges.example')
  expect(prisma.verificationToken.create).not.toHaveBeenCalled()
  expect(prisma.verificationToken.deleteMany).not.toHaveBeenCalled()
  expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
})

test('rejects external callback destinations in generated reset links', async () => {
  await requestPasswordReset(customer.email, 'https://ganges.example', 'https://attacker.invalid')
  expect(new URL(jest.mocked(emailService.sendPasswordReset).mock.calls[0][0].resetUrl).searchParams.get('callbackUrl')).toBe('/dashboard')
})

test('failed delivery removes only this attempt, without logging a secret', async () => {
  jest.mocked(emailService.sendPasswordReset).mockResolvedValue({ success: false })
  await expect(requestPasswordReset(customer.email, 'https://ganges.example')).rejects.toThrow('could not be delivered')
  const sent = jest.mocked(emailService.sendPasswordReset).mock.calls[0][0]
  const raw = new URLSearchParams(new URL(sent.resetUrl).hash.slice(1)).get('token')!
  expect(prisma.verificationToken.deleteMany).toHaveBeenLastCalledWith({ where: { identifier, token: hash(raw) } })
})

test('consumes the token and changes the password/session version inside one transaction', async () => {
  await resetPassword(token, 'NewPassword!')
  expect(prisma.verificationToken.findUnique).toHaveBeenCalledWith({ where: { token: hash(token) } })
  expect(prisma.verificationToken.deleteMany).toHaveBeenNthCalledWith(1, { where: { identifier, token: hash(token), expires: { gt: expect.any(Date) } } })
  expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: customer.id }, data: { password: 'new-hash', passwordChangedAt: expect.any(Date) } })
  expect(prisma.verificationToken.deleteMany).toHaveBeenLastCalledWith({ where: { identifier: { startsWith: `password-reset:${customer.id}:` } } })
})

test.each(['', 'not-a-token', 'a'.repeat(63), 'a'.repeat(65)])('rejects malformed tokens before querying users', async value => {
  await expect(resetPassword(value, 'NewPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  expect(prisma.verificationToken.findUnique).not.toHaveBeenCalled()
})

test.each([null, { ...validCandidate(), expires: new Date(0) }, { ...validCandidate(), identifier: 'oauth-verification' }])('rejects missing, expired and unrelated verification tokens', async entry => {
  jest.mocked(prisma.verificationToken.findUnique).mockResolvedValue(entry)
  await expect(resetPassword(token, 'NewPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  expect(prisma.user.update).not.toHaveBeenCalled()
})

test.each([null, { ...customer, email: 'changed@example.test' }, { ...customer, password: null }])('rejects deleted, email-changed and OAuth-only accounts at redemption', async user => {
  jest.mocked(prisma.user.findUnique).mockResolvedValue(user as never)
  await expect(resetPassword(token, 'NewPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  expect(prisma.user.update).not.toHaveBeenCalled()
})

test('a replay or concurrent loser cannot replace a password', async () => {
  jest.mocked(prisma.verificationToken.deleteMany).mockResolvedValueOnce({ count: 0 })
  await expect(resetPassword(token, 'NewPassword!')).rejects.toBeInstanceOf(PasswordResetError)
  expect(prisma.user.update).not.toHaveBeenCalled()
})

test('does not silently truncate long UTF-8 passwords', async () => {
  await expect(resetPassword(token, 'é'.repeat(40))).rejects.toBeInstanceOf(PasswordResetError)
  expect(bcrypt.hash).not.toHaveBeenCalled()
})

test('request endpoint returns a generic response before any account lookup and ignores the request host', async () => {
  const response = await forgot(request({ email: customer.email }))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({ success: true, message: 'If an account with a password matches that email, we will send a reset link.' })
  expect(prisma.user.findMany).not.toHaveBeenCalled()
  const task = jest.mocked(after).mock.calls[0][0] as () => Promise<void>
  await task()
  expect(jest.mocked(emailService.sendPasswordReset).mock.calls[0][0].resetUrl).toMatch(/^https:\/\/ganges\.example\//)
})

test('missing email configuration returns a uniform unavailable response without scheduling account work', async () => {
  jest.mocked(emailService.isEnabled).mockReturnValue(false)
  expect((await forgot(request({ email: customer.email }))).status).toBe(503)
  expect((await forgot(request({ email: 'unknown@example.test' }))).status).toBe(503)
  expect(after).not.toHaveBeenCalled()
})

test('invalid input does not schedule email or change a password', async () => {
  expect((await forgot(request({ email: 'invalid' }))).status).toBe(400)
  expect((await applyReset(request({ token, newPassword: 'short' }))).status).toBe(400)
  expect(after).not.toHaveBeenCalled()
  expect(prisma.user.update).not.toHaveBeenCalled()
})

test('reset endpoint confirms a committed change and rejects a used link', async () => {
  expect((await applyReset(request({ token, newPassword: 'NewPassword!' }))).status).toBe(200)
  jest.mocked(prisma.verificationToken.findUnique).mockResolvedValue(null)
  expect((await applyReset(request({ token, newPassword: 'AnotherPassword!' }))).status).toBe(400)
})

test('normal password changes also invalidate old sessions and outstanding recovery links', async () => {
  expect((await changePassword(request({ currentPassword: 'OldPassword!', newPassword: 'NewPassword!' }))).status).toBe(200)
  expect(prisma.user.updateMany).toHaveBeenCalledWith({ where: { id: customer.id, password: customer.password }, data: { password: 'new-hash', passwordChangedAt: expect.any(Date) } })
  expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: { startsWith: `password-reset:${customer.id}:` } } })
})

test('a concurrent password replacement cannot reuse the formerly correct current password', async () => {
  jest.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 })
  expect((await changePassword(request({ currentPassword: 'OldPassword!', newPassword: 'NewPassword!' }))).status).toBe(409)
  expect(prisma.verificationToken.deleteMany).not.toHaveBeenCalled()
})
