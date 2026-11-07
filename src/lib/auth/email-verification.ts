import { createHash, randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { emailService } from '@/lib/email/email.service'

const LIFETIME_MS = 30 * 60_000
const COOLDOWN_MS = 5 * 60_000
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const emailHash = (value: string) => hash(value.trim().toLowerCase())

export class EmailVerificationError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Private status is always loaded from the current authenticated account. */
export async function emailVerificationStatus(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId, closedAt: null }, select: { id: true, email: true, emailVerified: true } })
  if (!user) throw new EmailVerificationError('Unauthorized', 401)
  return { ownerId: user.id, email: user.email, verifiedAt: user.emailVerified?.toISOString() ?? null }
}

/** Reserve one delivery per account under the existing security lock; never accept a recipient from the browser. */
export async function requestEmailVerification(userId: string, expectedEmail: string, origin: string) {
  const delivery = await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'account', userId)
    const user = await tx.user.findUnique({ where: { id: userId, closedAt: null }, select: { id: true, email: true, emailVerified: true, securityVersion: true } })
    if (!user || user.email !== expectedEmail || user.emailVerified) return null
    const now = new Date()
    const rateToken = hash(`email-verification-rate:${userId}`)
    const rateIdentifier = `email-verification-rate:${userId}`
    const current = await tx.verificationToken.findUnique({ where: { token: rateToken } })
    if (current && current.expires > now) return null
    await tx.verificationToken.deleteMany({ where: { token: rateToken, identifier: rateIdentifier, expires: { lte: now } } })
    const rateExpires = new Date(now.getTime() + COOLDOWN_MS)
    await tx.verificationToken.create({ data: { token: rateToken, identifier: rateIdentifier, expires: rateExpires } })
    const prefix = `email-verification:${userId}:`
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: prefix }, expires: { lte: now } } })
    const token = randomBytes(32).toString('hex')
    const tokenHash = hash(token)
    const identifier = `${prefix}${emailHash(user.email)}:${user.securityVersion}`
    await tx.verificationToken.create({ data: { token: tokenHash, identifier, expires: new Date(now.getTime() + LIFETIME_MS) } })
    return { token, tokenHash, identifier, email: user.email, rateToken, rateIdentifier, rateExpires }
  })
  if (!delivery) return
  try {
    const link = new URL('/auth/verify-email', origin)
    link.hash = new URLSearchParams({ token: delivery.token }).toString()
    const result = await emailService.sendEmailVerification({ to: delivery.email, link: link.href })
    if (!result.success) throw new Error('Delivery failed')
  } catch {
    await prisma.verificationToken.deleteMany({ where: { OR: [
      { token: delivery.tokenHash, identifier: delivery.identifier },
      { token: delivery.rateToken, identifier: delivery.rateIdentifier, expires: delivery.rateExpires },
    ] } })
    console.error('[auth][email-verification][delivery-failed]')
  }
}

/** Possession verifies only the still-matching email; it cannot issue a session, change credentials or bypass MFA. */
export async function confirmEmailVerification(token: string) {
  const tokenHash = hash(token)
  const record = await prisma.verificationToken.findUnique({ where: { token: tokenHash } })
  const parts = record?.identifier.split(':')
  const invalid = () => new EmailVerificationError('This verification link is invalid or has expired. Request a new link in account settings.')
  if (!record || record.expires <= new Date() || parts?.length !== 4 || parts[0] !== 'email-verification') throw invalid()
  const userId = parts[1]
  await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'account', userId)
    const user = await tx.user.findUnique({ where: { id: userId, closedAt: null }, select: { email: true, emailVerified: true, securityVersion: true } })
    if (!user || emailHash(user.email) !== parts[2] || String(user.securityVersion) !== parts[3]) throw invalid()
    const consumed = await tx.verificationToken.deleteMany({ where: { token: tokenHash, identifier: record.identifier, expires: { gt: new Date() } } })
    if (consumed.count !== 1) throw invalid()
    if (!user.emailVerified) {
      const changed = await tx.user.updateMany({ where: { id: userId, email: user.email, emailVerified: null, securityVersion: user.securityVersion, closedAt: null }, data: { emailVerified: new Date() } })
      if (changed.count !== 1) throw invalid()
    }
    await tx.verificationToken.deleteMany({ where: { identifier: { startsWith: `email-verification:${userId}:` } } })
  })
}
