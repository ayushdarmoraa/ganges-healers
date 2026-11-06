import { createHash, randomBytes } from 'node:crypto'
import { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { safeCallbackUrl } from './callback-url'
import { passwordVersion } from './password-version'

const TOKEN_LIFETIME_MS = 15 * 60_000
const REQUEST_INTERVAL_MS = 5 * 60_000
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export const RESET_MESSAGE = 'If an account with a password uses that email, you will receive a reset link. Check your inbox and spam folder.'

export class PasswordResetError extends Error {}

export { trustedAuthEmailOrigin as passwordResetBaseUrl } from './email-links'

/** Run after the generic HTTP response so account lookup and mail timing cannot enumerate users. */
export async function requestPasswordReset(email: string, baseUrl: string, callbackUrl: unknown) {
  const matches = await prisma.user.findMany({
    where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } },
    select: { id: true, email: true, password: true, closedAt: true },
    take: 2,
  })
  // Older mixed-case accounts can collide under an insensitive lookup; never choose one arbitrarily.
  if (matches.length !== 1) return
  const user = matches[0]
  if (!user?.password || user.closedAt) return
  const now = new Date()
  const rateToken = digest(`password-reset-rate:${user.id}`)
  const rateIdentifier = `password-reset-rate:${user.id}`
  const rateExpires = new Date(now.getTime() + REQUEST_INTERVAL_MS)
  await prisma.verificationToken.deleteMany({ where: { token: rateToken, identifier: rateIdentifier, expires: { lte: now } } })
  try {
    // The unique token makes this throttle shared across serverless instances and concurrent requests.
    await prisma.verificationToken.create({ data: { token: rateToken, identifier: rateIdentifier, expires: rateExpires } })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
    throw error
  }
  const prefix = `password-reset:${user.id}:`
  const token = randomBytes(32).toString('hex')
  const tokenHash = digest(token)
  const identifier = `${prefix}${passwordVersion(user.password)}:${digest(user.email.trim().toLowerCase())}`
  try {
    await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: prefix }, expires: { lte: now } } })
    await prisma.verificationToken.create({ data: { token: tokenHash, identifier, expires: new Date(now.getTime() + TOKEN_LIFETIME_MS) } })
    const link = new URL('/auth/reset-password', baseUrl)
    const destination = safeCallbackUrl(callbackUrl)
    if (destination !== '/dashboard') link.searchParams.set('callbackUrl', destination)
    // A fragment is not sent in HTTP requests or Referer headers. The page clears it immediately.
    link.hash = new URLSearchParams({ token }).toString()
    const result = await emailService.sendPasswordReset({ to: user.email, link: link.href })
    if (!result.success) throw new Error('Reset delivery failed')
  } catch {
    // Release only this attempt's throttle reservation, so a delayed failure cannot erase a newer one.
    await prisma.verificationToken.deleteMany({ where: { OR: [
      { token: tokenHash, identifier },
      { token: rateToken, identifier: rateIdentifier, expires: rateExpires },
    ] } })
    console.error('[auth][password-reset][delivery-failed]')
  }
}

/** Consume the recovery token and update the credential atomically; concurrent replays cannot win. */
export async function confirmPasswordReset(token: string, newPassword: string) {
  const tokenHash = digest(token)
  const record = await prisma.verificationToken.findUnique({ where: { token: tokenHash } })
  const now = new Date()
  const parts = record?.identifier.split(':')
  if (!record || record.expires <= now || parts?.length !== 4 || parts[0] !== 'password-reset') throw new PasswordResetError('This reset link is invalid or has expired. Request a new link.')
  const userId = parts[1]
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, password: true, closedAt: true } })
  if (!user?.password || user.closedAt || parts[2] !== passwordVersion(user.password) || parts[3] !== digest(user.email.trim().toLowerCase())) throw new PasswordResetError('This reset link is invalid or has expired. Request a new link.')
  const hashed = await bcrypt.hash(newPassword, 12)
  await prisma.$transaction(async tx => {
    // Lock the account before token rows, so different concurrent links cannot deadlock each other.
    const changed = await tx.user.updateMany({ where: { id: userId, email: user.email, password: user.password, closedAt: null }, data: { password: hashed } })
    if (changed.count !== 1) throw new PasswordResetError('This reset link is invalid or has expired. Request a new link.')
    const consumed = await tx.verificationToken.deleteMany({ where: { token: tokenHash, identifier: record.identifier, expires: { gt: new Date() } } })
    if (consumed.count !== 1) throw new PasswordResetError('This reset link is invalid or has expired. Request a new link.')
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: `password-reset:${userId}:` } } })
    await tx.session.deleteMany({ where: { userId } })
  })
  console.info('[auth][password-reset][completed]')
}
