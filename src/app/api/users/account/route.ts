import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { AccountClosureError, accountClosureStatus, closeOwnAccount } from '@/lib/users/account-closure'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }
const input = z.object({ ownerId: z.string().min(1).max(200), reviewVersion: z.string().regex(/^[a-f0-9]{64}$/), confirmation: z.literal('CLOSE MY ACCOUNT'), acknowledged: z.literal(true) }).strict()
function failure(error: unknown) {
  if (error instanceof AccountClosureError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers })
  console.error('[users][account][error]')
  return NextResponse.json({ error: 'Unable to manage account closure. Refresh the review before trying again.' }, { status: 500, headers })
}
export async function GET() {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    return NextResponse.json(await accountClosureStatus(session.user.id, session.user.recentAuthentication), { headers })
  } catch (error) { return failure(error) }
}
export async function DELETE(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (request.headers.get('sec-fetch-site') === 'cross-site' || origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return NextResponse.json({ error: 'Use a JSON request' }, { status: 415, headers })
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    const parsed = input.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Review your account, acknowledge the consequences and type CLOSE MY ACCOUNT to confirm.' }, { status: 400, headers })
    if (parsed.data.ownerId !== session.user.id) return NextResponse.json({ error: 'Your account changed. Reload settings.', code: 'SESSION_CHANGED' }, { status: 409, headers })
    return NextResponse.json(await closeOwnAccount(session.user.id, parsed.data.reviewVersion, session.user.recentAuthentication), { headers })
  } catch (error) { return failure(error) }
}
