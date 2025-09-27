import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRazorpayClient } from '@/lib/razorpay'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BodySchema = z.object({
  planSlug: z.string().min(2)
})

export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = session.user.id

    const body = await req.json().catch(()=> ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    const { planSlug } = parsed.data

    const plan = await prisma.membershipPlan.findUnique({ where: { slug: planSlug } })
    if (!plan || !plan.isActive) return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 })

    // Block duplicate active/pending membership
    const existing = await prisma.vIPMembership.findFirst({ where: { userId, status: { in: ['pending','active'] } } })
    if (existing) {
      console.warn('[membership][subscribe][blocked_duplicate]', { userId, current: existing.id, status: existing.status })
      return NextResponse.json({ error: 'Membership already active or pending', membershipId: existing.id }, { status: 409 })
    }

    const client = await getRazorpayClient()
    if (!client) return NextResponse.json({ error: 'Payment gateway unavailable' }, { status: 500 })

    // Create subscription in Razorpay
    const subscription = await client.subscriptions.create({
      plan_id: plan.razorpayPlanId,
      total_count: 0, // ongoing until cancellation
      quantity: 1,
      customer_notify: 1,
      notes: { planSlug, planId: plan.id, userId }
    })

    const membership = await prisma.vIPMembership.create({
      data: {
        userId,
        planId: plan.id,
        subscriptionId: subscription.id,
        status: 'pending'
      }
    })

    console.log('[membership][subscribe][created]', { userId, planId: plan.id, membershipId: membership.id, subscriptionId: subscription.id })

    return NextResponse.json({ subscriptionId: subscription.id, membershipId: membership.id })
  } catch (err) {
    console.error('[membership][subscribe][error]', err)
    return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
  }
}
