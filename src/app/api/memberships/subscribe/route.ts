import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BodySchema = z.object({ planSlug: z.string().min(2) })

export async function POST(req: Request) {
  try {
    // Keep existing auth check (instruction didn't remove it)
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
    const { planSlug } = parsed.data

    // Look up plan (active only) selecting required fields
    const plan = await prisma.membershipPlan.findFirst({
      where: { slug: planSlug, isActive: true },
      select: { id: true, razorpayPlanId: true, pricePaise: true, interval: true }
    })
    if (!plan) return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 })

    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      console.error('[membership][subscribe][error]', { reason: 'missing_keys' })
      return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
    }
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')

    const url = 'https://api.razorpay.com/v1/subscriptions'
    const payload = { plan_id: plan.razorpayPlanId, total_count: 12, customer_notify: 1 }
    console.log('[membership][subscribe] POST /v1/subscriptions', { planId: plan.razorpayPlanId, interval: plan.interval })
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '---')
      console.error('[membership][subscribe][error]', { status: resp.status, body: text.slice(0, 600) })
      return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
    }
    interface RazorpayCreateSub { id?: string; short_url?: string }
    const json = await resp.json() as RazorpayCreateSub
    if (!json.id) {
      console.error('[membership][subscribe][error]', { reason: 'missing_id_field', json })
      return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
    }
    return NextResponse.json({ id: json.id, shortUrl: json.short_url || null })
  } catch (err) {
    console.error('[membership][subscribe][error]', err)
    return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
  }
}
