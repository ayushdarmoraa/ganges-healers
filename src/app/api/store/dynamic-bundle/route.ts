import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getDynamicBundle } from '@/lib/store/dynamic-bundle'
import { getSessionId } from '@/lib/analytics/session'

/**
 * GET /api/store/dynamic-bundle?chakra=Heart
 *
 * Returns a behavior-based bundle recommendation for the current user/session.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const chakra = searchParams.get('chakra') || undefined

  const [sessionId, session] = await Promise.all([
    getSessionId(),
    auth().catch(() => null),
  ])

  const result = await getDynamicBundle({
    sessionId,
    userId: session?.user?.id ?? null,
    chakra,
  })

  if (!result.bundle) {
    return NextResponse.json({ bundle: null })
  }

  return NextResponse.json(result)
}
