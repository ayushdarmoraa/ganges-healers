import { URI } from 'otpauth'
import { acceptedAuthenticatorStep, authenticatorSetup, generateAuthenticatorCode, matchingRecoveryCode, newRecoveryCodes, openAuthenticatorSecret, sealAuthenticatorSecret } from '@/lib/auth/two-factor-crypto'
import { passwordVersion, sessionCredentialVersion } from '@/lib/auth/password-version'
const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'
beforeEach(() => { jest.replaceProperty(process, 'env', { ...process.env, AUTH_SECRET: 'two-factor-test-encryption-secret' }) })
afterEach(() => jest.restoreAllMocks())
test.each([[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']])('matches the RFC 6238 SHA-1 vector at %s seconds', (seconds, code) => {
  expect(generateAuthenticatorCode(secret, Number(seconds) * 1000, 8)).toBe(code)
})
test('accepts a bounded clock window and refuses a consumed or older time step', () => {
  const now = 2000000000000
  const current = generateAuthenticatorCode(secret, now)
  const step = acceptedAuthenticatorStep(secret, current, null, now)
  expect(step).not.toBeNull()
  expect(acceptedAuthenticatorStep(secret, current, step, now)).toBeNull()
  expect(acceptedAuthenticatorStep(secret, generateAuthenticatorCode(secret, now + 30000), step, now)).toBe(BigInt(Math.floor(now / 30000) + 1))
  expect(acceptedAuthenticatorStep(secret, generateAuthenticatorCode(secret, now + 90000), null, now)).toBeNull()
})
test('encrypts randomized account-bound envelopes and rejects swapping, tampering and key changes', () => {
  const sealed = sealAuthenticatorSecret(secret, 'owner')
  expect(sealed).not.toContain(secret)
  expect(sealAuthenticatorSecret(secret, 'owner')).not.toBe(sealed)
  expect(openAuthenticatorSecret(sealed, 'owner')).toBe(secret)
  expect(() => openAuthenticatorSecret(sealed, 'other-account')).toThrow()
  for (const part of [1, 2, 3]) {
    const envelope = sealed.split('.')
    const bytes = Buffer.from(envelope[part], 'base64url')
    bytes[0] ^= 1
    envelope[part] = bytes.toString('base64url')
    const changed = envelope.join('.')
    expect(changed).not.toBe(sealed)
    expect(() => openAuthenticatorSecret(changed, 'owner')).toThrow()
  }
  process.env.AUTH_SECRET = 'another-configured-auth-key'
  expect(() => openAuthenticatorSecret(sealed, 'owner')).toThrow()
})
test('uses no public default when the configured authentication secret is absent', () => {
  delete process.env.AUTH_SECRET; delete process.env.NEXTAUTH_SECRET
  expect(() => sealAuthenticatorSecret(secret, 'owner')).toThrow('temporarily unavailable')
})
test('setup creates a local image and standards-based URI for exactly the same key', () => {
  const setup = authenticatorSetup(secret, 'आयुष@example.test')
  expect(setup.qrDataUrl).toMatch(/^data:image\/gif;base64,/)
  expect(Buffer.from(setup.qrDataUrl.split(',')[1], 'base64').subarray(0, 4).toString()).toBe('GIF8')
  expect(URI.parse(setup.otpauthUri).secret.base32).toBe(secret)
  expect(setup.otpauthUri).toMatch(/^[\x20-\x7e]+$/)
})
test('recovery codes are distinct 128-bit values with account-bound hashes', () => {
  const recovery = newRecoveryCodes('owner')
  expect(new Set(recovery.codes).size).toBe(8)
  expect(recovery.codes.every(code => /^[0-9A-F]{4}(-[0-9A-F]{4}){7}$/.test(code))).toBe(true)
  expect(recovery.hashes.join()).not.toContain(recovery.codes[0])
  expect(matchingRecoveryCode('owner', recovery.codes[0].toLowerCase(), recovery.hashes)).toBe(0)
  expect(matchingRecoveryCode('other', recovery.codes[0], recovery.hashes)).toBe(-1)
})
test('security versions revoke old sessions without resurrecting them when a factor is disabled', () => {
  expect(sessionCredentialVersion('hash', 0)).toBe(passwordVersion('hash'))
  expect(sessionCredentialVersion('hash', 1)).not.toBe(sessionCredentialVersion('hash', 0))
  expect(sessionCredentialVersion('hash', 2)).not.toBe(sessionCredentialVersion('hash', 1))
  expect(sessionCredentialVersion('hash', 2)).not.toBe(sessionCredentialVersion('hash', 0))
})
