import { NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'

// Test-only helper to bypass UI + CSRF for e2e. DO NOT ENABLE IN PRODUCTION.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role') || 'ADMIN'
  const email = searchParams.get('email') || 'admin@ganges-healers.com'
  const userId = searchParams.get('id') || 'test-admin-id'
  const token = await encode({
    token: {
      id: userId,
      email,
      name: 'Test Admin',
      role,
      vip: true,
      freeSessionCredits: 5,
    },
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || 'dev_fallback_secret',
    salt: 'test-salt'
  })
  const res = new NextResponse(JSON.stringify({ ok: true, role }), { status: 200 })
  res.headers.set('Content-Type', 'application/json')
  // Match next-auth JWT session cookie naming (non-secure dev)
  const base = `Path=/; HttpOnly; SameSite=Lax; Max-Age=3600`
  // Set multiple cookie names to satisfy NextAuth/Auth.js variations
  res.headers.append('Set-Cookie', `next-auth.session-token=${token}; ${base}`)
  res.headers.append('Set-Cookie', `authjs.session-token=${token}; ${base}`)
  res.headers.append('Set-Cookie', `__Secure-authjs.session-token=${token}; ${base}`)
  // Set test bypass cookie for role enforcement shortcut
  res.headers.append('Set-Cookie', `test-admin=1; Path=/; SameSite=Lax; Max-Age=3600`)
  return res
}
