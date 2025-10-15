import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { prisma } from '@/lib/prisma'
import { canonicalizePlanSlug } from '@/lib/memberships/slug'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Use shared canonicalization helper

const rz = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
})

function classifyKey(id?: string | null) {
  if (!id) return 'unknown'
  return id.includes('test') ? 'test' : (id.includes('live') ? 'live' : 'custom')
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url)
    const dryQuery = url.searchParams.get('dry') === '1'
    const diag = url.searchParams.get('diag') === '1'
    const body = await req.json().catch(() => ({} as any)) // eslint-disable-line @typescript-eslint/no-explicit-any
    const rawSlug = body?.planSlug ?? ''
    const canonical = canonicalizePlanSlug(rawSlug)
    const dry = !!body?.dry || dryQuery

    if (!canonical) {
      return NextResponse.json({ error: 'unknown-plan', planSlug: rawSlug, canonical: null }, { status: 400 })
    }

    // Always resolve plan from DB using canonical slug
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
        marker: 'SUBSCRIBE_V3',
        planSlug: rawSlug,
        canonical,
        planId,
        keyPrefix: process.env.RAZORPAY_KEY_ID?.slice(0, 12),
        keyMode: classifyKey(process.env.RAZORPAY_KEY_ID),
        dry: true,
      })
    }

    // Optional diagnostic: verify plan is accessible to current key before creating subscription
    if (diag) {
      try {
        const fetched = await (rz as any).plans.fetch(planId) // eslint-disable-line @typescript-eslint/no-explicit-any
        return NextResponse.json({
          diagnostic: 'plan_fetch_ok',
          planId,
          interval: fetched?.period,
          item: fetched?.item?.name,
          keyMode: classifyKey(process.env.RAZORPAY_KEY_ID),
        })
      } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        return NextResponse.json({
          error: 'Plan not accessible for current key',
          errorDetail: e?.description || e?.message,
          planId,
          keyMode: classifyKey(process.env.RAZORPAY_KEY_ID),
        }, { status: 400 })
      }
    }

    let sub
    try {
      sub = await rz.subscriptions.create({
        plan_id: planId,
        total_count: 1, // can adjust after verification
        customer_notify: 1,
      })
    } catch (creationErr: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      console.error('[membership][subscribe][creation_failed]', {
        planId,
        keyMode: classifyKey(process.env.RAZORPAY_KEY_ID),
        message: creationErr?.description || creationErr?.message,
        status: creationErr?.status,
        error: creationErr,
      })
      return NextResponse.json({
        error: 'Subscription initiation failed',
        errorDetail: creationErr?.description || creationErr?.message || 'unknown',
        planId,
        keyMode: classifyKey(process.env.RAZORPAY_KEY_ID),
      }, { status: 500 })
    }

    const shortUrl = (sub as any).short_url ?? (sub as any).shortUrl // eslint-disable-line @typescript-eslint/no-explicit-any
    return NextResponse.json({ id: sub.id, shortUrl })
  } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    console.error('[membership][subscribe][unhandled]', {
      message: err?.description || err?.message,
      status: err?.status,
      stack: err?.stack,
    })
    return NextResponse.json({
      error: 'Subscription initiation failed',
      errorDetail: err?.description || err?.message || 'unhandled',
    }, { status: 500 })
  }
}
