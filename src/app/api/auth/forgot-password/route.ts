import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { emailService } from '@/lib/email/email.service'
import { passwordResetOrigin, requestPasswordReset } from '@/lib/auth/password-reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Input = z.object({ email: z.string().trim().max(254).email(), callbackUrl: z.unknown().optional() })

export async function POST(request: Request) {
  const input = Input.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  const origin = passwordResetOrigin()
  if (!origin || !emailService.isEnabled()) {
    return NextResponse.json({ error: 'Password recovery is temporarily unavailable. Please try again later.' }, { status: 503 })
  }
  // Defer account lookup and email delivery alike: both the message and response timing are independent of account existence.
  after(async () => {
    try { await requestPasswordReset(input.data.email, origin, input.data.callbackUrl) }
    catch { console.error('[auth][password-reset][request-failed]') }
  })
  return NextResponse.json({ success: true, message: 'If an account with a password matches that email, we will send a reset link.' }, { headers: { 'Cache-Control': 'no-store' } })
}
