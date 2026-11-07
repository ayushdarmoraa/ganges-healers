import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { confirmPasswordReset, PasswordResetError, passwordResetBaseUrl, requestPasswordReset } from '@/lib/auth/password-reset'
import { passwordVersion } from '@/lib/auth/password-version'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import bcrypt from 'bcryptjs'
import { POST as requestReset } from '@/app/api/auth/password-reset/route'
import { POST as confirmReset } from '@/app/api/auth/password-reset/confirm/route'
import { POST as changePassword } from '@/app/api/users/me/password/route'

const mockAfterCallbacks: Array<() => Promise<void>> = []
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: (callback: () => Promise<void>) => { mockAfterCallbacks.push(callback) } }))

jest.mock('@/lib/prisma', () => ({ prisma: { user: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() }, verificationToken: { create: jest.fn(), deleteMany: jest.fn(), findUnique: jest.fn() }, session: { deleteMany: jest.fn() }, $transaction: jest.fn() } }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { isEnabled: jest.fn(() => true), sendPasswordReset: jest.fn() } }))
jest.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'owner' } }) }))
jest.mock('bcryptjs', () => ({ __esModule: true, default: { hash: jest.fn() } }))
const db = jest.mocked(prisma)
const token = 'a'.repeat(64)
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const record = { token: hash(token), identifier: `password-reset:owner:${passwordVersion('old-hash')}:${hash('owner@example.test')}`, expires: new Date(Date.now() + 60_000) }

beforeEach(() => {
  jest.clearAllMocks()
  mockAfterCallbacks.length = 0
  jest.replaceProperty(process, 'env', { NODE_ENV: 'test', AUTH_URL: 'https://example.test' })
  jest.mocked(emailService.isEnabled).mockReturnValue(true)
  db.user.findMany.mockResolvedValue([{ id: 'owner', email: 'Owner@example.test', password: 'old-hash' }] as never)
  db.user.findUnique.mockResolvedValue({ id: 'owner', email: 'Owner@example.test', password: 'old-hash' } as never)
  db.verificationToken.findUnique.mockResolvedValue(record)
  db.verificationToken.deleteMany.mockResolvedValue({ count: 1 })
  db.verificationToken.create.mockResolvedValue(record)
  db.user.updateMany.mockResolvedValue({ count: 1 })
  db.$transaction.mockImplementation(async callback => (callback as (tx: unknown) => Promise<unknown>)(db))
  jest.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never)
  jest.mocked(emailService.sendPasswordReset).mockResolvedValue({ success: true })
})
afterEach(() => jest.restoreAllMocks())

test.each([
  [{ AUTH_URL: 'https://www.gangeshealers.com/auth' }, 'https://www.gangeshealers.com'],
  [{ VERCEL_URL: 'preview.vercel.app' }, 'https://preview.vercel.app'],
  [{ NEXTAUTH_URL: 'http://localhost:3010', NODE_ENV: 'test' }, 'http://localhost:3010'],
  [{ NEXTAUTH_URL: 'http://localhost:3010', NODE_ENV: 'production' }, null],
  [{ AUTH_URL: 'https://user:password@example.test' }, null],
  [{ AUTH_URL: 'https://example.test/?untrusted=1' }, null],
  [{ AUTH_URL: 'http://example.test' }, null],
  [{}, null],
])('recovery links use a trusted configured origin (%j)', (environment, expected) => {
  expect(passwordResetBaseUrl(environment as NodeJS.ProcessEnv)).toBe(expected)
})

test('sends one short-lived fragment link while storing only its hash and preserving the safe journey', async () => {
  const callback = '/services/reiki?openBooking=1&healerId=chosen'
  await requestPasswordReset('owner@example.test', 'https://example.test', callback)
  const mail = jest.mocked(emailService.sendPasswordReset).mock.calls[0][0]
  const link = new URL(mail.link)
  const raw = new URLSearchParams(link.hash.slice(1)).get('token')!
  expect(raw).toMatch(/^[a-f0-9]{64}$/)
  expect(link.searchParams.get('token')).toBeNull()
  expect(link.searchParams.get('callbackUrl')).toBe(callback)
  expect(db.verificationToken.create).toHaveBeenLastCalledWith({ data: { token: hash(raw), identifier: record.identifier, expires: expect.any(Date) } })
  expect(JSON.stringify(db.verificationToken.create.mock.calls)).not.toContain(raw)
  const expires = db.verificationToken.create.mock.calls[1][0].data.expires as Date
  expect(expires.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000)
})

test.each([null, { id: 'social', email: 'social@example.test', password: null }])('unknown or social-only identities receive no recovery token (%j)', async user => {
  db.user.findMany.mockResolvedValue(user ? [user] as never : [])
  await requestPasswordReset('unknown@example.test', 'https://example.test', '//evil.example')
  expect(db.verificationToken.create).not.toHaveBeenCalled()
  expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
})

test('concurrent or repeated requests are stopped by the database uniqueness throttle', async () => {
  db.verificationToken.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: 'test' }))
  await requestPasswordReset('owner@example.test', 'https://example.test', '/dashboard')
  expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
  expect(db.verificationToken.create).toHaveBeenCalledTimes(1)
})

test('failed delivery invalidates the undelivered link without logging its value', async () => {
  jest.mocked(emailService.sendPasswordReset).mockResolvedValue({ success: false })
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  await requestPasswordReset('owner@example.test', 'https://example.test', 'https://evil.example')
  expect(new URL(jest.mocked(emailService.sendPasswordReset).mock.calls[0][0].link).search).toBe('')
  expect(db.verificationToken.deleteMany).toHaveBeenLastCalledWith({ where: { OR: [
    { token: expect.stringMatching(/^[a-f0-9]{64}$/), identifier: record.identifier },
    { token: hash('password-reset-rate:owner'), identifier: 'password-reset-rate:owner', expires: expect.any(Date) },
  ] } })
  expect(log).toHaveBeenCalledWith('[auth][password-reset][delivery-failed]')
  log.mockRestore()
})

test.each([
  null,
  { ...record, expires: new Date(0) },
  { ...record, identifier: 'email-verification:owner:other' },
  { ...record, identifier: `password-reset:owner:${passwordVersion('changed-hash')}` },
])('invalid, expired, wrong-purpose or superseded tokens cannot change a password (%j)', async value => {
  db.verificationToken.findUnique.mockResolvedValue(value)
  await expect(confirmPasswordReset(token, 'NewPassword123')).rejects.toBeInstanceOf(PasswordResetError)
  expect(bcrypt.hash).not.toHaveBeenCalled()
  expect(db.$transaction).not.toHaveBeenCalled()
})

test('the successful transaction replaces only the verified credential and clears recovery links and database sessions', async () => {
  await confirmPasswordReset(token, 'NewPassword123')
  expect(bcrypt.hash).toHaveBeenCalledWith('NewPassword123', 12)
  expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'owner', email: 'Owner@example.test', password: 'old-hash', closedAt: null }, data: { password: 'new-hash' } })
  expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { token: hash(token), identifier: record.identifier, expires: { gt: expect.any(Date) } } })
  expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: { startsWith: 'password-reset:owner:' } } })
  expect(db.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'owner' } })
})

test('a credential changed concurrently cannot be overwritten by the stale link', async () => {
  db.user.updateMany.mockResolvedValue({ count: 0 })
  await expect(confirmPasswordReset(token, 'NewPassword123')).rejects.toBeInstanceOf(PasswordResetError)
  expect(db.verificationToken.deleteMany).not.toHaveBeenCalled()
})

test('a consumed token rejects the transaction rather than completing a second update', async () => {
  db.verificationToken.deleteMany.mockResolvedValue({ count: 0 })
  await expect(confirmPasswordReset(token, 'NewPassword123')).rejects.toBeInstanceOf(PasswordResetError)
  expect(db.session.deleteMany).not.toHaveBeenCalled()
})

test('request returns the same generic response before any account lookup or delivery', async () => {
  const response = await requestReset(new Request('https://attacker.invalid/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email: 'owner@example.test' }), headers: { Host: 'attacker.invalid' } }))
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.json()).toEqual({ message: expect.stringContaining('If an account') })
  expect(db.user.findMany).not.toHaveBeenCalled()
  expect(mockAfterCallbacks).toHaveLength(1)
  await mockAfterCallbacks[0]()
  expect(new URL(jest.mocked(emailService.sendPasswordReset).mock.calls[0][0].link).origin).toBe('https://example.test')
})

test('missing delivery configuration is reported consistently without accepting a fake request', async () => {
  jest.mocked(emailService.isEnabled).mockReturnValue(false)
  const response = await requestReset(new Request('https://example.test/api/auth/password-reset', { method: 'POST', body: JSON.stringify({ email: 'any@example.test' }) }))
  expect(response.status).toBe(503)
  expect(mockAfterCallbacks).toHaveLength(0)
  expect(db.user.findMany).not.toHaveBeenCalled()
})

test.each(['not-json', JSON.stringify({ email: 'invalid' }), JSON.stringify({ email: 'owner@example.test', token: 'untrusted' })])('rejects invalid recovery requests (%s)', async body => {
  expect((await requestReset(new Request('https://example.test/api/auth/password-reset', { method: 'POST', body }))).status).toBe(400)
  expect(mockAfterCallbacks).toHaveLength(0)
})

test.each(['short', '🙂'.repeat(30), 'a'.repeat(73)])('rejects an invalid or bcrypt-truncated replacement password', async newPassword => {
  expect((await confirmReset(new Request('https://example.test/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword }) }))).status).toBe(400)
  expect(db.verificationToken.findUnique).not.toHaveBeenCalled()
})

test('confirmation preserves a safe invalid-link error and never returns a token or account identity', async () => {
  db.verificationToken.findUnique.mockResolvedValue(null)
  const response = await confirmReset(new Request('https://example.test/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ token, newPassword: 'Replacement123!' }) }))
  expect(response.status).toBe(400)
  expect(await response.json()).toEqual({ error: 'This reset link is invalid or has expired. Request a new link.' })
})

test('ambiguous legacy email accounts cannot receive a reset for an arbitrary match', async () => {
  db.user.findMany.mockResolvedValue([
    { id: 'one', email: 'Owner@example.test', password: 'one' },
    { id: 'two', email: 'owner@example.test', password: 'two' },
  ] as never)
  await requestPasswordReset(' OWNER@EXAMPLE.TEST ', 'https://example.test', '/dashboard')
  expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { email: { equals: 'owner@example.test', mode: 'insensitive' } }, take: 2 }))
  expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
  expect(db.verificationToken.create).not.toHaveBeenCalled()
})

test('a recovery link cannot reset an account after its email identity changes', async () => {
  db.user.findUnique.mockResolvedValue({ id: 'owner', email: 'different@example.test', password: 'old-hash' } as never)
  await expect(confirmPasswordReset(token, 'Replacement123!')).rejects.toBeInstanceOf(PasswordResetError)
  expect(bcrypt.hash).not.toHaveBeenCalled()
  expect(db.user.updateMany).not.toHaveBeenCalled()
})

test('a rejected email promise releases only its own token and throttle reservation', async () => {
  jest.mocked(emailService.sendPasswordReset).mockRejectedValueOnce(new Error('provider unavailable'))
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  await requestPasswordReset('owner@example.test', 'https://example.test', '/dashboard')
  const createdRate = db.verificationToken.create.mock.calls[0][0].data
  expect(db.verificationToken.deleteMany).toHaveBeenLastCalledWith({ where: { OR: [
    { token: expect.stringMatching(/^[a-f0-9]{64}$/), identifier: record.identifier },
    { token: createdRate.token, identifier: createdRate.identifier, expires: createdRate.expires },
  ] } })
  expect(log).toHaveBeenCalledWith('[auth][password-reset][delivery-failed]')
})

test('failed reset-token persistence also releases the claimed throttle', async () => {
  db.verificationToken.create.mockResolvedValueOnce(record).mockRejectedValueOnce(new Error('write failed'))
  jest.spyOn(console, 'error').mockImplementation(() => {})
  await requestPasswordReset('owner@example.test', 'https://example.test', '/dashboard')
  expect(emailService.sendPasswordReset).not.toHaveBeenCalled()
  expect(db.verificationToken.deleteMany).toHaveBeenLastCalledWith({ where: { OR: expect.arrayContaining([
    expect.objectContaining({ token: hash('password-reset-rate:owner'), expires: expect.any(Date) }),
  ]) } })
})

test.each(['a'.repeat(73), 'é'.repeat(40)])('settings also reject passwords that bcrypt would truncate', async newPassword => {
  const response = await changePassword(new Request('https://example.test/api/users/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: 'Original123!', newPassword }) }))
  expect(response.status).toBe(400)
  expect(db.user.findUnique).not.toHaveBeenCalled()
  expect(db.user.updateMany).not.toHaveBeenCalled()
})
