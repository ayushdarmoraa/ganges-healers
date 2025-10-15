// DEPRECATED: Legacy Razorpay webhook path. Use /api/payments/webhook instead.
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const target = new URL('/api/payments/webhook', req.url)
  // Preserve method and body; Next.js app routes will handle downstream
  return NextResponse.redirect(target, 307)
}
