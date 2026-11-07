import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { canonicalizePlanSlug } from '@/lib/memberships/slug'
import { auth } from '@/lib/auth'
import { createMembershipCheckout, MembershipCheckoutError } from '@/lib/memberships/checkout'
import { getRazorpayClient } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Use shared canonicalization helper

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
    })

    const planId = plan?.razorpayPlanId?.trim()
    if (!planId || !plan?.isActive) {
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

    const session = !diag ? await auth() : null
    if (!diag && !session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rz = await getRazorpayClient()
    if (!rz) throw new Error('Razorpay client not configured')

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

    try {
      const checkout = await createMembershipCheckout(session!.user.id, plan, async args => {
        const gatewayPlan = await rz.plans.fetch(planId)
        if (gatewayPlan?.item?.amount !== plan.pricePaise || gatewayPlan?.item?.currency !== 'INR' || gatewayPlan?.period !== plan.interval.toLowerCase() || gatewayPlan?.interval !== 1) {
          throw new MembershipCheckoutError('Payment plan configuration changed. Please contact support.', 409)
        }
        return rz.subscriptions.create(args)
      })
      return NextResponse.json(checkout)
    } catch (error) {
      if (error instanceof MembershipCheckoutError) return NextResponse.json({ error: error.message }, { status: error.status })
      console.error('[membership][subscribe][creation_failed]', { planId, keyMode: classifyKey(process.env.RAZORPAY_KEY_ID) })
      return NextResponse.json({ error: 'Subscription initiation failed', errorDetail: 'Please try again or contact support.', planId, keyMode: classifyKey(process.env.RAZORPAY_KEY_ID) }, { status: 500 })
    }
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
