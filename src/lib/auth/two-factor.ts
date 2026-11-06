import { prisma } from '@/lib/prisma'
import type { Prisma, TwoFactorCredential } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { lockTransaction } from '@/lib/db/locks'
import { passwordVersion } from './password-version'
import { acceptedAuthenticatorStep, authenticatorSetup, matchingRecoveryCode, newAuthenticatorSecret, newRecoveryCodes, openAuthenticatorSecret, sealAuthenticatorSecret, TwoFactorError } from './two-factor-crypto'

const password = z.string().min(1).max(1024)
const code = z.string().trim().min(1).max(128)
export const twoFactorAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('begin'), password }).strict(),
  z.object({ action: z.literal('enable'), password, code }).strict(),
  z.object({ action: z.literal('disable'), password, code }).strict(),
  z.object({ action: z.literal('recovery'), password, code }).strict(),
  z.object({ action: z.literal('cancel'), password }).strict(),
])
const WINDOW_MS = 5 * 60000
interface Outcome { success: true; enabled: boolean; reauthenticate?: boolean; recoveryCodes?: string[]; setup?: { secret: string; email: string; expiresAt: string } }
interface Failure { error: { message: string; status: number; retryAfterSeconds?: number } }
function retryAfter(row: TwoFactorCredential, now: Date) {
  if (!row.failureWindowStart || now.getTime() - row.failureWindowStart.getTime() >= WINDOW_MS || row.failedAttempts < 5) return 0
  return Math.max(1, Math.ceil((row.failureWindowStart.getTime() + WINDOW_MS - now.getTime()) / 1000))
}
async function failed(tx: Prisma.TransactionClient, row: TwoFactorCredential, now: Date) {
  const reset = !row.failureWindowStart || now.getTime() - row.failureWindowStart.getTime() >= WINDOW_MS
  await tx.twoFactorCredential.update({ where: { userId: row.userId }, data: { failedAttempts: reset ? 1 : row.failedAttempts + 1, failureWindowStart: reset ? now : row.failureWindowStart } })
  return { error: { message: 'Password or two-factor code is invalid.', status: 400 } }
}
async function consumeFactor(tx: Prisma.TransactionClient, row: TwoFactorCredential, candidate: string, now: Date) {
  const recovery = matchingRecoveryCode(row.userId, candidate, row.recoveryHashes)
  if (recovery >= 0) {
    await tx.twoFactorCredential.update({ where: { userId: row.userId }, data: { recoveryHashes: row.recoveryHashes.filter((_, index) => index !== recovery), failedAttempts: 0, failureWindowStart: null } })
    return true
  }
  let step: bigint | null = null
  try { if (row.encryptedSecret) step = acceptedAuthenticatorStep(openAuthenticatorSecret(row.encryptedSecret, row.userId), candidate, row.lastAcceptedStep, now.getTime()) } catch (error) { if (!(error instanceof TwoFactorError)) throw error }
  if (step === null) return false
  await tx.twoFactorCredential.update({ where: { userId: row.userId }, data: { lastAcceptedStep: step, failedAttempts: 0, failureWindowStart: null } })
  return true
}

/** Login consumes one factor under the account lock and refuses a password/security change mid-request. */
export async function verifyTwoFactorLogin(input: { userId: string; passwordHash: string; securityVersion: number; code: string }) {
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'account', input.userId)
    const user = await tx.user.findUnique({ where: { id: input.userId, closedAt: null }, select: { password: true, securityVersion: true } })
    if (!user || user.password !== input.passwordHash || user.securityVersion !== input.securityVersion) return false
    const row = await tx.twoFactorCredential.findUnique({ where: { userId: input.userId } })
    if (!row?.enabled) return true
    const now = new Date()
    if (retryAfter(row, now)) return false
    if (await consumeFactor(tx, row, input.code, now)) return true
    await failed(tx, row, now)
    return false
  }, { maxWait: 10000, timeout: 10000 })
}

export async function twoFactorStatus(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId, closedAt: null }, select: { password: true, twoFactorCredential: { select: { enabled: true, recoveryHashes: true } } } })
  if (!user) throw new TwoFactorError('Unauthorized', 401)
  return { enabled: user.twoFactorCredential?.enabled ?? false, hasPassword: !!user.password, recoveryCodesRemaining: user.twoFactorCredential?.enabled ? user.twoFactorCredential.recoveryHashes.length : 0 }
}

/** Private owner action; failed attempts commit their shared durable rate limit before returning an error. */
export async function changeTwoFactor(userId: string, action: z.infer<typeof twoFactorAction>) {
  const result = await prisma.$transaction<Outcome | Failure>(async tx => {
    await lockTransaction(tx, 'account', userId)
    const user = await tx.user.findUnique({ where: { id: userId, closedAt: null }, select: { id: true, email: true, password: true, securityVersion: true } })
    if (!user?.password) return { error: { message: 'A password is required before enabling authenticator protection.', status: 409 } }
    const row = await tx.twoFactorCredential.upsert({ where: { userId }, create: { userId }, update: {} })
    const now = new Date(), retry = retryAfter(row, now)
    if (retry) return { error: { message: 'Too many attempts. Try again shortly.', status: 429, retryAfterSeconds: retry } }
    if (!await bcrypt.compare(action.password, user.password)) return failed(tx, row, now)
    if (action.action === 'begin') {
      if (row.enabled) return { error: { message: 'Authenticator protection is already enabled.', status: 409 } }
      const current = row.pendingEncryptedSecret && row.pendingExpiresAt && row.pendingExpiresAt > now && row.pendingPasswordVersion === passwordVersion(user.password)
      let secret: string | null = null
      let reuse = false
      if (current) { try { secret = openAuthenticatorSecret(row.pendingEncryptedSecret!, userId); reuse = true } catch {} }
      secret ??= newAuthenticatorSecret()
      const expires = reuse && row.pendingExpiresAt ? row.pendingExpiresAt : new Date(now.getTime() + 10 * 60000)
      await tx.twoFactorCredential.update({ where: { userId }, data: { pendingEncryptedSecret: sealAuthenticatorSecret(secret, userId), pendingPasswordVersion: passwordVersion(user.password), pendingExpiresAt: expires } })
      return { success: true, enabled: false, setup: { secret, email: user.email, expiresAt: expires.toISOString() } }
    }
    if (action.action === 'cancel') {
      if (row.enabled) return { error: { message: 'Use the authenticated disable action for an active factor.', status: 409 } }
      await tx.twoFactorCredential.update({ where: { userId }, data: { pendingEncryptedSecret: null, pendingPasswordVersion: null, pendingExpiresAt: null } })
      return { success: true, enabled: false }
    }
    if (action.action === 'enable') {
      if (row.enabled || !row.pendingEncryptedSecret || !row.pendingExpiresAt || row.pendingExpiresAt <= now || row.pendingPasswordVersion !== passwordVersion(user.password)) return { error: { message: 'Start a fresh authenticator setup before confirming.', status: 409 } }
      const secret = openAuthenticatorSecret(row.pendingEncryptedSecret, userId)
      const step = acceptedAuthenticatorStep(secret, action.code, null, now.getTime())
      if (step === null) return failed(tx, row, now)
      const recovery = newRecoveryCodes(userId)
      const changed = await tx.user.updateMany({ where: { id: userId, password: user.password, securityVersion: user.securityVersion }, data: { securityVersion: { increment: 1 } } })
      if (changed.count !== 1) throw new TwoFactorError('Account security changed; sign in again.', 409)
      await tx.twoFactorCredential.update({ where: { userId }, data: { enabled: true, encryptedSecret: sealAuthenticatorSecret(secret, userId), lastAcceptedStep: step, recoveryHashes: recovery.hashes, pendingEncryptedSecret: null, pendingPasswordVersion: null, pendingExpiresAt: null, failedAttempts: 0, failureWindowStart: null } })
      return { success: true, enabled: true, reauthenticate: true, recoveryCodes: recovery.codes }
    }
    if (!row.enabled) return { error: { message: 'Authenticator protection is not enabled.', status: 409 } }
    if (!await consumeFactor(tx, row, action.code, now)) return failed(tx, row, now)
    const changed = await tx.user.updateMany({ where: { id: userId, password: user.password, securityVersion: user.securityVersion }, data: { securityVersion: { increment: 1 } } })
    if (changed.count !== 1) throw new TwoFactorError('Account security changed; sign in again.', 409)
    if (action.action === 'disable') {
      await tx.twoFactorCredential.delete({ where: { userId } })
      return { success: true, enabled: false, reauthenticate: true }
    }
    const recovery = newRecoveryCodes(userId)
    await tx.twoFactorCredential.update({ where: { userId }, data: { recoveryHashes: recovery.hashes } })
    return { success: true, enabled: true, reauthenticate: true, recoveryCodes: recovery.codes }
  }, { maxWait: 10000, timeout: 15000 })
  if ('error' in result) throw new TwoFactorError(result.error.message, result.error.status, result.error.retryAfterSeconds)
  if (result.setup) return { success: true as const, enabled: false, expiresAt: result.setup.expiresAt, ...authenticatorSetup(result.setup.secret, result.setup.email) }
  return result
}
