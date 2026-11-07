import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { emailService } from '@/lib/email/email.service'
import { trustedAuthEmailOrigin } from '@/lib/auth/email-links'
import { EmailVerificationError, emailVerificationStatus, requestEmailVerification } from '@/lib/auth/email-verification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const schema = z.object({ ownerId: z.string().min(1).max(200), email: z.string().email().max(254) }).strict()

export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    return NextResponse.json(await emailVerificationStatus(session.user.id), { headers })
  } catch (error) {
    if (error instanceof EmailVerificationError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    console.error('[auth][email-verification][status-error]')
    return NextResponse.json({ error: 'Unable to load email verification.' }, { status: 500, headers })
  }
}

export async function POST(request: Request) {
  try {
    const originHeader = request.headers.get('origin')
    if (request.headers.get('sec-fetch-site') === 'cross-site' || originHeader && originHeader !== new URL(request.url).origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Use a JSON request' }, { status: 415, headers })
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    const body = schema.safeParse(await request.json().catch(() => null))
    if (!body.success) return NextResponse.json({ error: 'Refresh your account settings and try again.' }, { status: 400, headers })
    const current = await emailVerificationStatus(session.user.id)
    if (body.data.ownerId !== current.ownerId || body.data.email !== current.email) return NextResponse.json({ error: 'Your account changed. Refresh your settings.', code: 'SESSION_CHANGED' }, { status: 409, headers })
    if (current.verifiedAt) return NextResponse.json({ ...current, status: 'verified' }, { headers })
    const origin = trustedAuthEmailOrigin()
    if (!emailService.isEnabled() || !origin) return NextResponse.json({ error: 'Email verification is temporarily unavailable. Please try again later.' }, { status: 503, headers })
    after(async () => {
      try { await requestEmailVerification(current.ownerId, current.email, origin) }
      catch { console.error('[auth][email-verification][request-error]') }
    })
    return NextResponse.json({ ownerId: current.ownerId, status: 'queued', message: 'Verification requested. Check your inbox and spam folder. Requests are limited to one every five minutes.' }, { headers })
  } catch (error) {
    if (error instanceof EmailVerificationError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    console.error('[auth][email-verification][request-error]')
    return NextResponse.json({ error: 'Unable to request email verification.' }, { status: 500, headers })
  }
}
