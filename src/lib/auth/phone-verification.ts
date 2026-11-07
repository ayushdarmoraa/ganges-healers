import { createHash, randomUUID } from 'node:crypto'
import type { PhoneVerification, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { lockTransaction } from '@/lib/db/locks'
import { sessionCredentialVersion } from '@/lib/auth/password-version'
import { isInternationalPhone, phoneSms, SmsVerificationError } from '@/lib/auth/phone-sms'

const HOUR = 60 * 60_000, LIFETIME = 10 * 60_000, COOLDOWN = 60_000, LEASE = 20_000
const MAX_SENDS = 3, MAX_ATTEMPTS = 5
const hash = (phone: string) => createHash('sha256').update(phone).digest('hex')
const userSelect = { id: true, phone: true, password: true, securityVersion: true, closedAt: true, phoneVerifiedAt: true, phoneVerifiedHash: true } as const
type Account = Prisma.UserGetPayload<{ select: typeof userSelect }>

export class PhoneVerificationError extends Error {
  constructor(message: string, public status = 400, public code = 'INVALID_CODE', public retryAfter?: number) { super(message) }
}
const invalid = () => new PhoneVerificationError('This code is invalid or expired. Request a new code if needed.')
const phoneChanged = () => new PhoneVerificationError('Your phone or account security changed. Refresh phone verification and request a new code.', 409, 'PHONE_CHANGED')
const verified = (user: Account) => isInternationalPhone(user.phone) && !!user.phoneVerifiedAt && user.phoneVerifiedHash === hash(user.phone)
const credential = (user: Account) => sessionCredentialVersion(user.password, user.securityVersion)
function requirePhone(user: Account | null, expected: string): asserts user is Account & { phone: string } {
  if (!user || user.closedAt) throw new PhoneVerificationError('Unauthorized', 401, 'UNAUTHORIZED')
  if (user.phone !== expected) throw phoneChanged()
  if (!isInternationalPhone(user.phone)) throw new PhoneVerificationError('Save your phone with an explicit +country code first.', 400, 'PHONE_FORMAT')
}
function limited(until: number) {
  throw new PhoneVerificationError('Please wait before trying phone verification again.', 429, 'RATE_LIMIT', Math.max(1, Math.ceil((until - Date.now()) / 1000)))
}
function retryAt(state: PhoneVerification | null, now: number) {
  if (!state) return 0
  return Math.max(state.nextSendAt.getTime(), state.sendsInWindow >= MAX_SENDS ? state.sendWindowStart.getTime() + HOUR : 0, now)
}
function providerError(error: unknown) {
  return error instanceof SmsVerificationError
    ? new PhoneVerificationError(error.message, error.status, 'SMS_UNAVAILABLE', error.status === 429 ? 60 : undefined)
    : new PhoneVerificationError('SMS verification is temporarily unavailable. Please try again later.', 503, 'SMS_UNAVAILABLE')
}

/** Private current-owner status contains neither provider identifiers nor credential fingerprints. */
export async function phoneVerificationStatus(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { ...userSelect, phoneVerification: true } })
  if (!user || user.closedAt) throw new PhoneVerificationError('Unauthorized', 401, 'UNAUTHORIZED')
  const state = user.phoneVerification, now = Date.now(), isVerified = verified(user)
  const active = !isVerified && isInternationalPhone(user.phone) && state?.providerId && state.phoneHash === hash(user.phone) && state.credentialVersion === credential(user) && state.expiresAt.getTime() > now && state.attempts < MAX_ATTEMPTS
  const retry = retryAt(state, now)
  return {
    ownerId: user.id, phone: user.phone, verifiedAt: isVerified ? user.phoneVerifiedAt!.toISOString() : null,
    canVerify: isInternationalPhone(user.phone), available: phoneSms.available(),
    challenge: active ? { id: state.requestId, expiresAt: state.expiresAt.toISOString() } : null,
    retryAt: retry > now ? new Date(retry).toISOString() : null,
  }
}

/** Reserve shared send limits before network I/O; a late provider reply cannot replace a newer request. */
export async function requestPhoneVerification(userId: string, phone: string) {
  const reservation = await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'account', userId)
    const user = await tx.user.findUnique({ where: { id: userId }, select: userSelect })
    requirePhone(user, phone)
    if (verified(user)) return null
    if (!phoneSms.available()) throw providerError(null)
    const now = new Date(), state = await tx.phoneVerification.findUnique({ where: { userId } })
    if (state?.checkingUntil && state.checkingUntil > now) limited(state.checkingUntil.getTime())
    const retry = retryAt(state, now.getTime())
    if (retry > now.getTime()) limited(retry)
    const sameWindow = state && state.sendWindowStart.getTime() + HOUR > now.getTime()
    const data = {
      requestId: randomUUID(), phoneHash: hash(phone), credentialVersion: credential(user), providerId: null,
      expiresAt: new Date(now.getTime() + LIFETIME), nextSendAt: new Date(now.getTime() + COOLDOWN),
      sendWindowStart: sameWindow ? state.sendWindowStart : now, sendsInWindow: sameWindow ? state.sendsInWindow + 1 : 1,
      attempts: 0, checkingId: null, checkingUntil: null, consentedAt: now,
    }
    await tx.phoneVerification.upsert({ where: { userId }, create: { userId, ...data }, update: data })
    return data
  })
  if (reservation) {
    try {
      const sid = await phoneSms.request(phone)
      await prisma.$transaction(async tx => {
        await lockTransaction(tx, 'account', userId)
        const user = await tx.user.findUnique({ where: { id: userId }, select: userSelect })
        requirePhone(user, phone)
        if (credential(user) !== reservation.credentialVersion) throw phoneChanged()
        const changed = await tx.phoneVerification.updateMany({ where: { userId, requestId: reservation.requestId, phoneHash: hash(phone), expiresAt: { gt: new Date() } }, data: { providerId: sid } })
        if (changed.count !== 1) throw phoneChanged()
      })
    } catch (error) {
      // Keep the reserved rate budget: an ambiguous network failure may still have delivered an SMS.
      await prisma.phoneVerification.updateMany({ where: { userId, requestId: reservation.requestId }, data: { providerId: null, expiresAt: new Date(0) } })
      if (error instanceof PhoneVerificationError) throw error
      throw providerError(error)
    }
  }
  const status = await phoneVerificationStatus(userId)
  if (status.phone !== phone) throw phoneChanged()
  return status
}

/** A short durable lease serializes provider checks without holding a database transaction over HTTP. */
export async function confirmPhoneVerification(userId: string, phone: string, requestId: string, code: string) {
  const check = await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'account', userId)
    const user = await tx.user.findUnique({ where: { id: userId }, select: userSelect })
    requirePhone(user, phone)
    const state = await tx.phoneVerification.findUnique({ where: { userId } }), now = new Date()
    if (!state || state.requestId !== requestId || !state.providerId || state.phoneHash !== hash(phone) || state.credentialVersion !== credential(user) || state.expiresAt <= now || state.attempts >= MAX_ATTEMPTS) throw invalid()
    if (state.checkingUntil && state.checkingUntil > now) limited(state.checkingUntil.getTime())
    if (!phoneSms.available()) throw providerError(null)
    const checkingId = randomUUID()
    await tx.phoneVerification.update({ where: { userId }, data: { checkingId, checkingUntil: new Date(now.getTime() + LEASE), attempts: { increment: 1 } } })
    return { checkingId, providerId: state.providerId, credentialVersion: state.credentialVersion }
  })
  let outcome: 'approved' | 'invalid' | 'expired'
  try { outcome = await phoneSms.check(phone, check.providerId, code) }
  catch (error) {
    await prisma.phoneVerification.updateMany({ where: { userId, requestId, checkingId: check.checkingId }, data: { checkingId: null, checkingUntil: null } })
    throw providerError(error)
  }
  const approved = await prisma.$transaction(async tx => {
    await lockTransaction(tx, 'account', userId)
    const user = await tx.user.findUnique({ where: { id: userId }, select: userSelect })
    requirePhone(user, phone)
    const state = await tx.phoneVerification.findUnique({ where: { userId } }), now = new Date()
    if (!state || state.requestId !== requestId || state.checkingId !== check.checkingId || state.providerId !== check.providerId || state.expiresAt <= now || !state.checkingUntil || state.checkingUntil <= now || credential(user) !== check.credentialVersion) throw invalid()
    if (outcome === 'approved') {
      const changed = await tx.user.updateMany({ where: { id: userId, phone, password: user.password, securityVersion: user.securityVersion, closedAt: null }, data: { phoneVerifiedAt: now, phoneVerifiedHash: hash(phone) } })
      if (changed.count !== 1) throw phoneChanged()
    }
    await tx.phoneVerification.update({ where: { userId }, data: {
      checkingId: null, checkingUntil: null,
      ...(outcome === 'approved' || outcome === 'expired' ? { providerId: null, expiresAt: now } : {}),
    } })
    return outcome === 'approved'
  })
  if (!approved) throw invalid()
  const status = await phoneVerificationStatus(userId)
  if (status.phone !== phone || !status.verifiedAt) throw phoneChanged()
  return status
}
