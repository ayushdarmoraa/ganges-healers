import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'
import { Secret, TOTP } from 'otpauth'
import qrcode from 'qrcode-generator'

export class TwoFactorError extends Error {
  constructor(message: string, public readonly status: number, public readonly retryAfterSeconds?: number) { super(message); this.name = 'TwoFactorError' }
}
function encryptionKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) throw new TwoFactorError('Account security is temporarily unavailable.', 503)
  return Buffer.from(hkdfSync('sha256', secret, 'ganges-healers:mfa', 'encryption:v1', 32))
}
/** An authenticated envelope binds the ciphertext to its account and existing authentication secret. */
export function sealAuthenticatorSecret(secret: string, userId: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(userId))
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.')
}
export function openAuthenticatorSecret(value: string, userId: string) {
  const key = encryptionKey()
  try {
    const parts = value.split('.')
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid envelope')
    const iv = Buffer.from(parts[1], 'base64url'), tag = Buffer.from(parts[2], 'base64url')
    if (iv.length !== 12 || tag.length !== 16 || parts[3].length > 512) throw new Error('Invalid envelope')
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAAD(Buffer.from(userId)); decipher.setAuthTag(tag)
    const secret = Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8')
    if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid secret')
    return secret
  } catch { throw new TwoFactorError('Authenticator data could not be read. Use a recovery code.', 409) }
}
export function newAuthenticatorSecret() { return new Secret({ size: 20 }).base32 }
function authenticator(secret: string, digits = 6, label = '') { return new TOTP({ issuer: 'Ganges Healers', label, algorithm: 'SHA1', digits, period: 30, secret: Secret.fromBase32(secret) }) }
/** Shared with the RFC-vector and real sign-in tests; production validation consumes the accepted step. */
export function generateAuthenticatorCode(secret: string, timestamp = Date.now(), digits = 6) { return authenticator(secret, digits).generate({ timestamp }) }
export function acceptedAuthenticatorStep(secret: string, code: string, last: bigint | null, timestamp = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null
  const delta = authenticator(secret).validate({ token: code, timestamp, window: 1, ...(last !== null ? { afterCounter: Number(last) } : {}) })
  if (delta === null) return null
  const step = BigInt(Math.floor(timestamp / 30000) + delta)
  return last !== null && step <= last ? null : step
}
export function recoveryHash(userId: string, code: string) { return createHash('sha256').update(`recovery:v1:${userId}:${code.replace(/[\s-]/g, '').toUpperCase()}`).digest('hex') }
export function newRecoveryCodes(userId: string) {
  const codes = Array.from({ length: 8 }, () => randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g)!.join('-'))
  return { codes, hashes: codes.map(code => recoveryHash(userId, code)) }
}
export function matchingRecoveryCode(userId: string, code: string, hashes: string[]) {
  if (!/^[0-9A-F]{32}$/.test(code.replace(/[\s-]/g, '').toUpperCase())) return -1
  const candidate = Buffer.from(recoveryHash(userId, code), 'hex')
  return hashes.findIndex(hash => /^[a-f0-9]{64}$/.test(hash) && timingSafeEqual(Buffer.from(hash, 'hex'), candidate))
}
/** QR generation is local: the secret is never sent to an image or authenticator service. */
export function authenticatorSetup(secret: string, email: string) {
  const uri = authenticator(secret, 6, email.slice(0, 254)).toString()
  const qr = qrcode(0, 'M'); qr.addData(uri, 'Byte'); qr.make()
  return { secret, otpauthUri: uri, qrDataUrl: qr.createDataURL(4, 8) }
}
