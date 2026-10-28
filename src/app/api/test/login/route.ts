import { isTestMode } from '@/lib/test-mode'
import { NextResponse } from 'next/server'
import { encode } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

// Test-only helper to bypass UI + CSRF for e2e. DO NOT ENABLE IN PRODUCTION.
export async function GET(request: Request) {
  // Fail closed before parsing the request, accessing users, or issuing cookies.
  if (!isTestMode()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const role = searchParams.get('role') || 'ADMIN'
  const email = searchParams.get('email') || 'admin@ganges-healers.com'
  const wantVip = searchParams.get('vip') === '1'
  const wantCredits = Number.parseInt(searchParams.get('credits') || '', 10)
  // Ensure user exists and get its real id so FK constraints pass
  type Role = 'ADMIN' | 'USER' | 'HEALER'
  let user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    user = await prisma.user.create({ data: { email, name: 'Test User', role: (role as Role) || 'USER', vip: true, freeSessionCredits: 5 } })
  } else {
    // Ensure desired role/vip/credits for the test session
    const nextVip = wantVip ? true : !!user.vip
    const nextCredits = Number.isFinite(wantCredits) ? (wantCredits as number) : (user.freeSessionCredits ?? 0)
    await prisma.user.update({ where: { id: user.id }, data: { role: (role as Role) || 'USER', vip: nextVip, freeSessionCredits: nextCredits } })
    user = (await prisma.user.findUnique({ where: { id: user.id } }))!
  }
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'dev_fallback_secret'
  const token = await encode({
    token: {
      // Include both sub and id for maximum compatibility with callbacks
      sub: user.id,
      id: user.id,
      email: user.email!,
      name: user.name || 'Test User',
      role: role,
      vip: true,
      freeSessionCredits: 5,
    },
    secret,
    salt: 'authjs.session-token',
  })
  const res = new NextResponse(JSON.stringify({ ok: true, role, userId: user.id }), { status: 200 })
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
