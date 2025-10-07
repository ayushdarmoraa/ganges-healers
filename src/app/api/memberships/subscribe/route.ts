import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function canonicalize(raw: string) {
  const s = (raw ?? '').toString().trim().toLowerCase()
  if (s === 'monthly') return 'vip-monthly'
  if (s === 'yearly') return 'vip-yearly'
  return raw
}

const rz = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const dryQuery = url.searchParams.get('dry') === '1'
    const body = await req.json().catch(() => ({} as any)) // eslint-disable-line @typescript-eslint/no-explicit-any
    const rawSlug = body?.planSlug ?? ''
    const canonical = canonicalize(rawSlug)
    const dry = !!body?.dry || dryQuery

    // Always resolve plan from DB
    const plan = await prisma.membershipPlan.findUnique({
      where: { slug: canonical },
      select: { razorpayPlanId: true },
    })

    const planId = plan?.razorpayPlanId?.trim()
    if (!planId) {
      return NextResponse.json(
        { error: 'Unknown or unconfigured plan', planSlug: rawSlug, canonical, planId: planId ?? null },
        { status: 400 }
      )
    }

    if (dry) {
      return NextResponse.json({
        planSlug: rawSlug,
        canonical,
        planId,
        keyPrefix: process.env.RAZORPAY_KEY_ID?.slice(0, 12),
        dry: true,
      })
    }

    const sub = await rz.subscriptions.create({
      plan_id: planId,
      total_count: 1,
      customer_notify: 1,
    })

    const shortUrl = (sub as any).short_url ?? (sub as any).shortUrl // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ id: sub.id, shortUrl })
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('[membership][subscribe][error]', {
      message: err?.description || err?.message,
      status: err?.status,
    })
    return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
  }
}
