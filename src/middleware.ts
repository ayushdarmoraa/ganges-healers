import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { checkRateLimit } from '@/lib/rate-limit'

/** Paths protected by rate limiting */
const RATE_LIMITED_PREFIXES = [
  '/api/auth/',
  '/api/bookings',
  '/api/community/',
  '/api/search',
  '/api/store/quiz-lead',
  '/api/store/cart-activity',
]

function shouldRateLimit(pathname: string): boolean {
  return RATE_LIMITED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

const SESSION_COOKIE = 'gh_sid'
const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response: NextResponse

  if (shouldRateLimit(pathname)) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'

    const result = checkRateLimit(ip)

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((result.retryAfterMs ?? 60000) / 1000)),
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    response = NextResponse.next()
    response.headers.set('X-RateLimit-Limit', '100')
    response.headers.set('X-RateLimit-Remaining', String(result.remaining))
  } else {
    response = NextResponse.next()
  }

  // Ensure anonymous session tracking cookie exists
  if (!request.cookies.get(SESSION_COOKIE)) {
    response.cookies.set(SESSION_COOKIE, crypto.randomUUID(), {
      maxAge: SESSION_MAX_AGE,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets:
     * - _next/static, _next/image, favicon.ico, image files
     */
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
