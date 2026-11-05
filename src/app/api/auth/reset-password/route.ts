import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PasswordResetError, recoveryPasswordSchema, resetPassword } from '@/lib/auth/password-reset'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const Input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), newPassword: recoveryPasswordSchema })

export async function POST(request: Request) {
  const input = Input.safeParse(await request.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'Check your reset link and use a password of at least 6 characters. If it is too long, choose a shorter password.' }, { status: 400 })
  try {
    await resetPassword(input.data.token, input.data.newPassword)
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof PasswordResetError) return NextResponse.json({ error: error.message }, { status: 400 })
    console.error('[auth][password-reset][apply-failed]')
    return NextResponse.json({ error: 'Your password could not be changed. Please try again.' }, { status: 500 })
  }
}
