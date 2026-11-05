import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { emailService } from '@/lib/email/email.service'
import { safeCallbackUrl } from './callback-url'

const TOKEN_PATTERN = /^[a-f0-9]{64}$/
const IDENTIFIER_PATTERN = /^password-reset:([^:]+):([a-f0-9]{64})$/
const TOKEN_LIFETIME_MS = 15 * 60_000
const REQUEST_COOLDOWN_MS = 60_000

export const recoveryPasswordSchema = z.string().min(6, 'Password must be at least 6 characters')
  .max(72, 'Password is too long')
  .refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password is too long; try a shorter password')

/** Fixed public errors never include an email, token, password, or database diagnostic. */
export class PasswordResetError extends Error {
  constructor() { super('This reset link is invalid or has expired. Request a new link.') }
}

function digest(value: string) { return createHash('sha256').update(value).digest('hex') }
function normalizedEmail(value: string) { return value.trim().toLowerCase() }
function identifierFor(userId: string, email: string) {
  return `password-reset:${userId}:${digest(normalizedEmail(email))}`
}

/** Use configured application origins only. Request Host/forwarded headers never choose email links. */
export function passwordResetOrigin(environment: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const configured = environment.NEXT_PUBLIC_SITE_URL || environment.AUTH_URL || environment.NEXTAUTH_URL
  if (!configured) return null
  try {
    const url = new URL(configured)
    const local = environment.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password) return null
    return url.origin
  } catch { return null }
}

/** Issue one opaque, expiring link per account; the caller schedules this after its generic response. */
export async function requestPasswordReset(email: string, origin: string, callbackUrl: unknown = undefined): Promise<void> {
  // Do not send password reset links for OAuth-only, unknown, or ambiguous legacy email accounts.
  const candidates = await prisma.user.findMany({
    where: { email: { equals: normalizedEmail(email), mode: 'insensitive' } },
    select: { id: true, email: true, password: true }, take: 2,
  })
  if (candidates.length !== 1 || !candidates[0].password) return
  const user = candidates[0]
  const identifier = identifierFor(user.id, user.email)
  const token = randomBytes(32).toString('hex')
  const hashedToken = digest(token)
  const issued = await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'credentials', user.id)
    const now = new Date()
    const recent = await tx.verificationToken.findFirst({ where: { identifier }, orderBy: { expires: 'desc' } })
    if (recent && recent.expires.getTime() - TOKEN_LIFETIME_MS + REQUEST_COOLDOWN_MS > now.getTime()) return false
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: `password-reset:${user.id}:` } } })
    await tx.verificationToken.create({ data: { identifier, token: hashedToken, expires: new Date(now.getTime() + TOKEN_LIFETIME_MS) } })
    return true
  })
  if (!issued) return
  const link = new URL('/auth/reset-password', origin)
  // Fragments are not sent in HTTP requests or Referer headers, keeping the secret out of access logs.
  link.hash = new URLSearchParams({ token }).toString()
  link.searchParams.set('callbackUrl', safeCallbackUrl(callbackUrl))
  try {
    const result = await emailService.sendPasswordReset({ to: user.email, resetUrl: link.href })
    if (!result.success) throw new Error('Reset delivery failed')
  } catch {
    // Bind cleanup to this attempt so it cannot erase a newer successful request.
    await prisma.verificationToken.deleteMany({ where: { identifier, token: hashedToken } })
    throw new Error('Password reset email could not be delivered')
  }
}

/** Atomically consume a reset link, replace the stored hash, and revoke prior password sessions. */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (!TOKEN_PATTERN.test(token) || !recoveryPasswordSchema.safeParse(newPassword).success) throw new PasswordResetError()
  const hashedToken = digest(token)
  const candidate = await prisma.verificationToken.findUnique({ where: { token: hashedToken } })
  const identity = candidate?.identifier.match(IDENTIFIER_PATTERN)
  if (!candidate || !identity || candidate.expires <= new Date()) throw new PasswordResetError()
  const userId = identity[1]
  const hash = await bcrypt.hash(newPassword, 12)
  await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'credentials', userId)
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, password: true } })
    if (!user?.password || identifierFor(user.id, user.email) !== candidate.identifier) throw new PasswordResetError()
    const now = new Date()
    const consumed = await tx.verificationToken.deleteMany({ where: { identifier: candidate.identifier, token: hashedToken, expires: { gt: now } } })
    if (consumed.count !== 1) throw new PasswordResetError()
    await tx.user.update({ where: { id: userId }, data: { password: hash, passwordChangedAt: now } })
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: `password-reset:${userId}:` } } })
  })
}
