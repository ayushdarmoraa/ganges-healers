import { after, NextResponse } from 'next/server'
import { z } from 'zod'
import { emailService } from '@/lib/email/email.service'
import { passwordResetBaseUrl, requestPasswordReset, RESET_MESSAGE } from '@/lib/auth/password-reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
const schema = z.object({ email: z.string().trim().email().max(254), callbackUrl: z.string().max(4096).optional() }).strict()

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400, headers })
  const baseUrl = passwordResetBaseUrl()
  if (!emailService.isEnabled() || !baseUrl) return NextResponse.json({ error: 'Password recovery is temporarily unavailable. Please try again later or contact support.' }, { status: 503, headers })
  after(async () => {
    try { await requestPasswordReset(parsed.data.email, baseUrl, parsed.data.callbackUrl) }
    catch { console.error('[auth][password-reset][request-error]') }
  })
  return NextResponse.json({ message: RESET_MESSAGE }, { headers })
}
