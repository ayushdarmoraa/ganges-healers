import { phoneSms, SmsVerificationError } from '@/lib/auth/phone-sms'
import { isInternationalPhone } from '@/config/phone'

const service = `VA${'a'.repeat(32)}`, sid = `VE${'b'.repeat(32)}`, phone = '+15555550101'
const body = { sid, service_sid: service, to: phone, channel: 'sms', status: 'pending' }
let request: jest.SpyInstance
beforeEach(() => {
  jest.replaceProperty(process, 'env', { NODE_ENV: 'test', TWILIO_VERIFY_SERVICE_SID: service, TWILIO_API_KEY_SID: `SK${'c'.repeat(32)}`, TWILIO_API_KEY_SECRET: 'synthetic-key-secret' })
  request = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body)))
})
afterEach(() => jest.restoreAllMocks())
test('the adapter is unavailable without a complete credential/service binding and never falls back from a partial key', async () => {
  delete process.env.TWILIO_API_KEY_SECRET
  process.env.TWILIO_ACCOUNT_SID = `AC${'d'.repeat(32)}`; process.env.TWILIO_AUTH_TOKEN = 'synthetic-legacy-token'
  expect(phoneSms.available()).toBe(false)
  await expect(phoneSms.request(phone)).rejects.toMatchObject({ status: 503 })
  expect(request).not.toHaveBeenCalled()
})
test('a bounded fixed-origin send uses only the stored phone and validates provider acceptance', async () => {
  expect(await phoneSms.request(phone)).toBe(sid)
  expect(request).toHaveBeenCalledWith(`https://verify.twilio.com/v2/Services/${service}/Verifications`, expect.objectContaining({ method: 'POST', redirect: 'error', cache: 'no-store', signal: expect.any(AbortSignal), body: new URLSearchParams({ To: phone, Channel: 'sms' }).toString(), headers: { Authorization: `Basic ${Buffer.from(`SK${'c'.repeat(32)}:synthetic-key-secret`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' } }))
})
test('existing account/auth-token credentials work when no API key pair is configured', async () => {
  delete process.env.TWILIO_API_KEY_SID; delete process.env.TWILIO_API_KEY_SECRET
  process.env.TWILIO_ACCOUNT_SID = `AC${'d'.repeat(32)}`; process.env.TWILIO_AUTH_TOKEN = 'synthetic-legacy-token'
  expect(phoneSms.available()).toBe(true)
  expect(await phoneSms.request(phone)).toBe(sid)
})
test.each([{ status: 'approved' }, { sid: 'wrong' }, { service_sid: `VA${'d'.repeat(32)}` }, { to: '+15555550102' }, { channel: 'call' }])('a send cannot accept a malformed or mismatched provider response %j', async extra => {
  request.mockResolvedValue(new Response(JSON.stringify({ ...body, ...extra })))
  await expect(phoneSms.request(phone)).rejects.toBeInstanceOf(SmsVerificationError)
})
test('checks use the saved provider SID and never put the code in a URL', async () => {
  request.mockResolvedValue(new Response(JSON.stringify({ ...body, status: 'approved' })))
  expect(await phoneSms.check(phone, sid, '123456')).toBe('approved')
  expect(request).toHaveBeenCalledWith(`https://verify.twilio.com/v2/Services/${service}/VerificationCheck`, expect.objectContaining({ body: new URLSearchParams({ VerificationSid: sid, Code: '123456' }).toString() }))
  expect(request.mock.calls[0][0]).not.toContain('123456')
})
test('a pending code is not approval and a missing/expired provider challenge is refused', async () => {
  expect(await phoneSms.check(phone, sid, '123456')).toBe('invalid')
  request.mockResolvedValue(new Response('{}', { status: 404 }))
  expect(await phoneSms.check(phone, sid, '123456')).toBe('expired')
})
test.each([{ sid: `VE${'d'.repeat(32)}` }, { to: '+15555550102' }, { service_sid: `VA${'d'.repeat(32)}` }])('an approved response for another binding is not accepted %j', async extra => {
  request.mockResolvedValue(new Response(JSON.stringify({ ...body, status: 'approved', ...extra })))
  await expect(phoneSms.check(phone, sid, '123456')).rejects.toBeInstanceOf(SmsVerificationError)
})
test.each([429, 500, 401])('provider HTTP %s errors are safe and do not expose response details', async status => {
  request.mockResolvedValue(new Response('private-provider-details', { status }))
  await expect(phoneSms.request(phone)).rejects.toMatchObject({ status: status === 429 ? 429 : 503 })
})
test('network failures and malformed JSON cannot become approval or disclose an exception', async () => {
  request.mockRejectedValueOnce(new Error('private-credential-and-phone')).mockResolvedValueOnce(new Response('{'))
  await expect(phoneSms.request(phone)).rejects.toMatchObject({ message: 'SMS verification is temporarily unavailable. Please try again later.' })
  await expect(phoneSms.check(phone, sid, '123456')).rejects.toMatchObject({ status: 503 })
})
test('unqualified numbers and malformed codes never reach the provider', async () => {
  await expect(phoneSms.request('9876543210')).rejects.toMatchObject({ status: 400 })
  expect(await phoneSms.check(phone, sid, 'abc')).toBe('invalid')
  expect(request).not.toHaveBeenCalled()
  expect(isInternationalPhone('+123456789012345')).toBe(true)
  expect(isInternationalPhone('+1234567890123456')).toBe(false)
  expect(isInternationalPhone(' +15555550101')).toBe(false)
})
