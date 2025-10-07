import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

const BodySchema = z.object({ planSlug: z.string().min(2), dry: z.boolean().optional() })

export async function POST(req: Request) {
  try {
    // Keep existing auth check (instruction didn't remove it)
    const session = await auth()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const urlObj = new URL(req.url)
  const queryDry = urlObj.searchParams.get('dry') === '1'
  const body = await req.json().catch(() => ({}))
  const parsed = BodySchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Invalid body', issues: parsed.error.issues }, { status: 400 })
  const { planSlug, dry: bodyDry } = parsed.data
    const raw = (planSlug ?? '').toString().trim()
    const canonical = raw.toLowerCase()
    const slug = canonical === 'monthly' ? 'vip-monthly'
      : canonical === 'yearly' ? 'vip-yearly'
      : raw

    const plan = await prisma.membershipPlan.findUnique({ where: { slug } })
    if (!plan || !plan.razorpayPlanId) {
      return NextResponse.json({ error: 'Unknown or unconfigured plan' }, { status: 400 })
    }
    const planId = plan.razorpayPlanId.trim()

  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keyId || !keySecret) {
      console.error('[membership][subscribe][error]', { reason: 'missing_keys' })
      return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
    }
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')

    const url = 'https://api.razorpay.com/v1/subscriptions'
    const payload = { plan_id: planId, total_count: 12, customer_notify: 1 }

    // Dry-run debug: skip Razorpay network call, just return resolution context
    if (queryDry || bodyDry) {
      return NextResponse.json({ planSlug: raw, canonical: slug, planId, keyPrefix: keyId ? keyId.slice(0,12) : null, dry: true })
    }
    console.log('[membership][subscribe] POST /v1/subscriptions', { input: planSlug, slug, planId, interval: plan.interval, key: keyId.slice(0,8) })
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!resp.ok) {
      const text = await resp.text().catch(() => '---')
      console.error('[membership][subscribe][error]', { status: resp.status, body: text.slice(0, 600), slug, planId, key: keyId.slice(0,8) })
      return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
    }
    interface RazorpayCreateSub { id?: string; short_url?: string; shortUrl?: string }
    const json = await resp.json() as RazorpayCreateSub
    if (!json.id) {
      console.error('[membership][subscribe][error]', { reason: 'missing_id_field', json, slug, planId, key: keyId.slice(0,8) })
      return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
    }
    return NextResponse.json({ id: json.id, shortUrl: json.short_url || json.shortUrl || null })
  } catch (err) {
    console.error('[membership][subscribe][error]', err)
    return NextResponse.json({ error: 'Subscription initiation failed' }, { status: 500 })
  }
}
