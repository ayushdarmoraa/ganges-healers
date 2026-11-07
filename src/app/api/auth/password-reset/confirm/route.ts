import { NextResponse } from 'next/server'
import { z } from 'zod'
import { confirmPasswordReset, PasswordResetError } from '@/lib/auth/password-reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
const schema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), newPassword: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, 'utf8') <= 72) }).strict()

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Use a valid reset link and a password of 8–72 UTF-8 bytes.' }, { status: 400, headers })
  try {
    await confirmPasswordReset(parsed.data.token, parsed.data.newPassword)
    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    if (error instanceof PasswordResetError) return NextResponse.json({ error: error.message }, { status: 400, headers })
    console.error('[auth][password-reset][confirm-error]')
    return NextResponse.json({ error: 'Unable to reset your password. Please try again.' }, { status: 500, headers })
  }
}
