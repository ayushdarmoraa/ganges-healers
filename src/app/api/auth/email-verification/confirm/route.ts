import { NextResponse } from 'next/server'
import { z } from 'zod'
import { confirmEmailVerification, EmailVerificationError } from '@/lib/auth/email-verification'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict()

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  if (request.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Use a JSON request' }, { status: 415, headers })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Use a valid verification link.' }, { status: 400, headers })
  try {
    await confirmEmailVerification(parsed.data.token)
    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    if (error instanceof EmailVerificationError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    console.error('[auth][email-verification][confirm-error]')
    return NextResponse.json({ error: 'Unable to verify your email. Please try again.' }, { status: 500, headers })
  }
}
