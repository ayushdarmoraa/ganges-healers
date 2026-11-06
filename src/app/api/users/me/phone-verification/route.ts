import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { confirmPhoneVerification, PhoneVerificationError, phoneVerificationStatus, requestPhoneVerification } from '@/lib/auth/phone-verification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const owner = { ownerId: z.string().min(1).max(200), phone: z.string().regex(/^\+[1-9]\d{7,14}$/) }
const input = z.discriminatedUnion('action', [
  z.object({ ...owner, action: z.literal('request'), consent: z.literal(true) }).strict(),
  z.object({ ...owner, action: z.literal('confirm'), challengeId: z.string().uuid(), code: z.string().regex(/^\d{4,10}$/) }).strict(),
])
function failure(error: unknown) {
  if (error instanceof PhoneVerificationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { ...headers, ...(error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : {}) } })
  console.error('[auth][phone-verification][error]')
  return NextResponse.json({ error: 'Unable to manage phone verification. Please try again.' }, { status: 500, headers })
}
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    return NextResponse.json(await phoneVerificationStatus(session.user.id), { headers })
  } catch (error) { return failure(error) }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (request.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Use a JSON request' }, { status: 415, headers })
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    const body = input.safeParse(await request.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'Use the current saved international phone, confirm SMS consent and enter a valid code when requested.' }, { status: 400, headers })
    if (body.data.ownerId !== session.user.id) return NextResponse.json({ error: 'Your account changed. Refresh phone verification.', code: 'SESSION_CHANGED' }, { status: 409, headers })
    const status = body.data.action === 'request'
      ? await requestPhoneVerification(session.user.id, body.data.phone)
      : await confirmPhoneVerification(session.user.id, body.data.phone, body.data.challengeId, body.data.code)
    return NextResponse.json({ ...status, status: status.verifiedAt ? 'verified' : 'pending' }, { headers })
  } catch (error) { return failure(error) }
}
