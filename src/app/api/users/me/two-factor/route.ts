import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { changeTwoFactor, twoFactorAction, twoFactorStatus } from '@/lib/auth/two-factor'
import { TwoFactorError } from '@/lib/auth/two-factor-crypto'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' }
function failure(error: unknown) {
  if (error instanceof TwoFactorError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { ...headers, ...(error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : {}) } })
  console.error('[auth][two-factor][failed]')
  return NextResponse.json({ error: 'Account security is temporarily unavailable.' }, { status: 503, headers })
}
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    return NextResponse.json(await twoFactorStatus(session.user.id), { headers })
  } catch (error) { return failure(error) }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin')
    if (req.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
    if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Use a JSON request' }, { status: 415, headers })
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    const parsed = twoFactorAction.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid account security action' }, { status: 400, headers })
    return NextResponse.json(await changeTwoFactor(session.user.id, parsed.data), { headers })
  } catch (error) { return failure(error) }
}
