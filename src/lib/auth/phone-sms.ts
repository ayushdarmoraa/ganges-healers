import { isInternationalPhone } from '@/config/phone'
export { isInternationalPhone } from '@/config/phone'

export class SmsVerificationError extends Error {
  constructor(message = 'SMS verification is temporarily unavailable. Please try again later.', public status = 503) { super(message) }
}

function configuration() {
  const service = process.env.TWILIO_VERIFY_SERVICE_SID?.trim()
  const key = process.env.TWILIO_API_KEY_SID?.trim(), secret = process.env.TWILIO_API_KEY_SECRET?.trim()
  const account = process.env.TWILIO_ACCOUNT_SID?.trim(), token = process.env.TWILIO_AUTH_TOKEN?.trim()
  if (!service || !/^VA[0-9a-f]{32}$/i.test(service)) return null
  if (key || secret) return key && /^SK[0-9a-f]{32}$/i.test(key) && secret ? { service, username: key, password: secret } : null
  return account && /^AC[0-9a-f]{32}$/i.test(account) && token ? { service, username: account, password: token } : null
}

async function call(path: 'Verifications' | 'VerificationCheck', values: Record<string, string>) {
  const config = configuration()
  if (!config) throw new SmsVerificationError()
  try {
    const response = await fetch(`https://verify.twilio.com/v2/Services/${config.service}/${path}`, {
      method: 'POST', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(values).toString(),
    })
    if (!response.ok) {
      if (response.status === 429) throw new SmsVerificationError('SMS verification is rate limited. Please wait and try again.', 429)
      if (path === 'VerificationCheck' && [400, 404].includes(response.status)) return null
      if (path === 'Verifications' && [400, 422].includes(response.status)) throw new SmsVerificationError('Unable to request verification for this number. Check its country code and try again later.', 400)
      throw new SmsVerificationError()
    }
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object') throw new SmsVerificationError()
    return { body: body as Record<string, unknown>, service: config.service }
  } catch (error) {
    if (error instanceof SmsVerificationError) throw error
    // Provider exceptions can contain credentials, phone numbers or codes. Do not propagate or log them.
    throw new SmsVerificationError()
  }
}

function matches(body: Record<string, unknown>, service: string, phone: string, sid?: string) {
  return typeof body.sid === 'string' && /^VE[0-9a-f]{32}$/i.test(body.sid) && (!sid || body.sid === sid) && body.service_sid === service && body.to === phone && body.channel === 'sms'
}

/** Fixed-origin, bounded provider calls; the caller supplies only the current stored phone/challenge. */
export const phoneSms = {
  available: () => configuration() !== null,
  async request(phone: string): Promise<string> {
    if (!isInternationalPhone(phone)) throw new SmsVerificationError('Save your phone with an explicit +country code first.', 400)
    const result = await call('Verifications', { To: phone, Channel: 'sms' })
    if (!result || !matches(result.body, result.service, phone) || result.body.status !== 'pending') throw new SmsVerificationError()
    return result.body.sid as string
  },
  async check(phone: string, sid: string, code: string): Promise<'approved' | 'invalid' | 'expired'> {
    if (!isInternationalPhone(phone) || !/^VE[0-9a-f]{32}$/i.test(sid) || !/^\d{4,10}$/.test(code)) return 'invalid'
    const result = await call('VerificationCheck', { VerificationSid: sid, Code: code })
    if (!result) return 'expired'
    if (!matches(result.body, result.service, phone, sid)) throw new SmsVerificationError()
    if (result.body.status === 'approved') return 'approved'
    if (result.body.status === 'pending') return 'invalid'
    return 'expired'
  },
}
