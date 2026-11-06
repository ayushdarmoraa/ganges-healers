import { createHash } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { confirmEmailVerification, emailVerificationStatus, EmailVerificationError, requestEmailVerification } from '@/lib/auth/email-verification'
import { GET, POST } from '@/app/api/users/me/email-verification/route'
import { POST as confirm } from '@/app/api/auth/email-verification/confirm/route'

const mockTasks: Array<() => Promise<void>> = []
let mockActor: string | null = 'owner'
jest.mock('next/server', () => ({ ...jest.requireActual('next/server'), after: (task: () => Promise<void>) => { mockTasks.push(task) } }))
jest.mock('@/lib/auth', () => ({ auth: async () => mockActor ? { user: { id: mockActor } } : null }))
jest.mock('@/lib/db/locks', () => ({ lockTransaction: jest.fn(async () => {}) }))
jest.mock('@/lib/email/email.service', () => ({ emailService: { isEnabled: jest.fn(), sendEmailVerification: jest.fn() } }))
jest.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: jest.fn(), updateMany: jest.fn() }, verificationToken: { findUnique: jest.fn(), create: jest.fn(), deleteMany: jest.fn() }, $transaction: jest.fn() } }))
const db = jest.mocked(prisma)
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const user = { id: 'owner', email: 'Owner@example.test', emailVerified: null, securityVersion: 2 }
const raw = 'a'.repeat(64)
const record = { token: hash(raw), identifier: `email-verification:owner:${hash('owner@example.test')}:2`, expires: new Date(Date.now() + 60_000) }
const request = (body: unknown, headers = {}) => new Request('https://example.test/api/users/me/email-verification', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
beforeEach(() => {
  jest.clearAllMocks(); mockTasks.length = 0; mockActor = 'owner'
  jest.replaceProperty(process, 'env', { NODE_ENV: 'test', AUTH_URL: 'https://example.test' })
  db.user.findUnique.mockResolvedValue(user as never)
  db.user.updateMany.mockResolvedValue({ count: 1 })
  db.verificationToken.findUnique.mockResolvedValue(null)
  db.verificationToken.create.mockResolvedValue(record)
  db.verificationToken.deleteMany.mockResolvedValue({ count: 1 })
  db.$transaction.mockImplementation(async callback => (callback as (tx: unknown) => Promise<unknown>)(db))
  jest.mocked(emailService.isEnabled).mockReturnValue(true)
  jest.mocked(emailService.sendEmailVerification).mockResolvedValue({ success: true })
})
afterEach(() => jest.restoreAllMocks())

test('private status exposes only the current account and verified date', async () => {
  expect(await emailVerificationStatus('owner')).toEqual({ ownerId: 'owner', email: user.email, verifiedAt: null })
  expect((await GET()).headers.get('cache-control')).toBe('private, no-store')
  db.user.findUnique.mockResolvedValue(null)
  await expect(emailVerificationStatus('deleted')).rejects.toMatchObject({ status: 401 })
})
test('anonymous status and request cannot query accounts or create tokens', async () => {
  mockActor = null
  expect((await GET()).status).toBe(401)
  expect((await POST(request({ ownerId: 'owner', email: user.email }))).status).toBe(401)
  expect(db.user.findUnique).not.toHaveBeenCalled()
})
test.each([{ ownerId: 'another', email: user.email }, { ownerId: 'owner', email: 'other@example.test' }])('stale account snapshots cannot address another recipient (%j)', async input => {
  expect((await POST(request(input))).status).toBe(409)
  expect(mockTasks).toHaveLength(0)
})
test('unconfigured delivery reports unavailable instead of claiming a sent link', async () => {
  jest.mocked(emailService.isEnabled).mockReturnValue(false)
  expect((await POST(request({ ownerId: 'owner', email: user.email }))).status).toBe(503)
  expect(mockTasks).toHaveLength(0)
})
test('the request is acknowledged before delivery and cannot substitute the destination Host', async () => {
  const response = await POST(request({ ownerId: 'owner', email: user.email }, { Host: 'evil.invalid' }))
  expect(await response.json()).toMatchObject({ ownerId: 'owner', status: 'queued' })
  expect(emailService.sendEmailVerification).not.toHaveBeenCalled()
  await mockTasks[0]()
  const sent = jest.mocked(emailService.sendEmailVerification).mock.calls[0][0]
  expect(sent.to).toBe(user.email)
  const link = new URL(sent.link)
  expect(link.origin).toBe('https://example.test')
  const token = new URLSearchParams(link.hash.slice(1)).get('token')!
  expect(token).toMatch(/^[a-f0-9]{64}$/)
  expect(link.search).toBe('')
  expect(JSON.stringify(db.verificationToken.create.mock.calls)).not.toContain(token)
  expect(db.verificationToken.create).toHaveBeenLastCalledWith({ data: { token: hash(token), identifier: record.identifier, expires: expect.any(Date) } })
})
test('an active database cooldown suppresses duplicate delivery', async () => {
  db.verificationToken.findUnique.mockResolvedValue({ ...record, identifier: 'email-verification-rate:owner' })
  await requestEmailVerification('owner', user.email, 'https://example.test')
  expect(db.verificationToken.create).not.toHaveBeenCalled()
  expect(emailService.sendEmailVerification).not.toHaveBeenCalled()
})
test('failed delivery removes only its link and throttle reservation so the owner can retry', async () => {
  jest.mocked(emailService.sendEmailVerification).mockResolvedValue({ success: false })
  jest.spyOn(console, 'error').mockImplementation(() => {})
  await requestEmailVerification('owner', user.email, 'https://example.test')
  expect(db.verificationToken.deleteMany).toHaveBeenLastCalledWith({ where: { OR: [
    { token: expect.stringMatching(/^[a-f0-9]{64}$/), identifier: record.identifier },
    { token: hash('email-verification-rate:owner'), identifier: 'email-verification-rate:owner', expires: expect.any(Date) },
  ] } })
})
test.each([null, { ...record, expires: new Date(0) }, { ...record, identifier: 'password-reset:owner:other:2' }])('invalid or wrong-purpose links cannot set verified status (%j)', async value => {
  db.verificationToken.findUnique.mockResolvedValue(value)
  await expect(confirmEmailVerification(raw)).rejects.toBeInstanceOf(EmailVerificationError)
  expect(db.user.updateMany).not.toHaveBeenCalled()
})
test.each([{ ...user, email: 'changed@example.test' }, { ...user, securityVersion: 3 }, null])('changed or deleted accounts reject the old link (%j)', async value => {
  db.verificationToken.findUnique.mockResolvedValue(record)
  db.user.findUnique.mockResolvedValue(value as never)
  await expect(confirmEmailVerification(raw)).rejects.toBeInstanceOf(EmailVerificationError)
  expect(db.user.updateMany).not.toHaveBeenCalled()
})
test('a valid link is consumed with a guarded update and clears other verification links', async () => {
  db.verificationToken.findUnique.mockResolvedValue(record)
  await confirmEmailVerification(raw)
  expect(db.user.updateMany).toHaveBeenCalledWith({ where: { id: 'owner', email: user.email, emailVerified: null, securityVersion: 2, closedAt: null }, data: { emailVerified: expect.any(Date) } })
  expect(db.verificationToken.deleteMany).toHaveBeenCalledWith({ where: { identifier: { startsWith: 'email-verification:owner:' } } })
})
test('a consumed token or changed account cannot be reported as verified', async () => {
  db.verificationToken.findUnique.mockResolvedValue(record)
  db.verificationToken.deleteMany.mockResolvedValue({ count: 0 })
  await expect(confirmEmailVerification(raw)).rejects.toBeInstanceOf(EmailVerificationError)
  expect(db.user.updateMany).not.toHaveBeenCalled()
})
test('cross-site requests and unsupported bodies fail before touching an account', async () => {
  expect((await POST(request({ ownerId: 'owner', email: user.email }, { Origin: 'https://evil.invalid' }))).status).toBe(403)
  expect((await confirm(request({ token: raw }, { 'Sec-Fetch-Site': 'cross-site' }))).status).toBe(403)
  expect((await POST(request({}, { 'Content-Type': 'text/plain' }))).status).toBe(415)
  expect((await confirm(request({}, { 'Content-Type': 'text/plain' }))).status).toBe(415)
  expect(db.user.findUnique).not.toHaveBeenCalled()
})
test('confirmation rejects arbitrary flags and does not issue a session cookie', async () => {
  expect((await confirm(request({ token: raw, emailVerified: true }))).status).toBe(400)
  db.verificationToken.findUnique.mockResolvedValue(record)
  const response = await confirm(request({ token: raw }))
  expect(await response.json()).toEqual({ success: true })
  expect(response.headers.get('set-cookie')).toBeNull()
})
