import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'
import { sendWhatsAppQuizRecommendation } from '@/lib/whatsapp/interakt'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { trackEvent } from '@/lib/analytics/track-event'
import { getSessionId } from '@/lib/analytics/session'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { email, name, intention, practice, chakra, phone } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const sanitizedEmail = email.trim().toLowerCase()

    // Validate phone with libphonenumber-js (default to India)
    let sanitizedPhone: string | null = null
    if (typeof phone === 'string' && phone.trim()) {
      const parsed = parsePhoneNumberFromString(phone.trim(), 'IN')
      if (parsed && parsed.isValid()) {
        sanitizedPhone = parsed.format('E.164')
      }
    }

    // Find the top 3 recommended products for this chakra
    const isNotSure = chakra === 'not-sure'
    const topProducts = await prisma.product.findMany({
      where: {
        isActive: true,
        ...(isNotSure ? {} : { chakra: chakra || undefined }),
      },
      orderBy: [{ isConsecrated: 'desc' }, { createdAt: 'desc' }],
      take: 3,
      select: { slug: true, title: true, chakra: true, pricePaise: true },
    })
    const topProduct = topProducts[0] ?? null
    const supportingProducts = topProducts.slice(1)

    // Upsert: if same email + quiz combo exists, update name/timestamp
    const lead = await prisma.quizLead.upsert({
      where: {
        email_intention_practice_chakra: {
          email: sanitizedEmail,
          intention: intention || '',
          practice: practice || '',
          chakra: chakra || '',
        },
      },
      update: {
        name: name?.trim() || undefined,
        phone: sanitizedPhone || undefined,
        productSlug: topProduct?.slug || undefined,
        productTitle: topProduct?.title || undefined,
      },
      create: {
        email: sanitizedEmail,
        name: name?.trim() || null,
        phone: sanitizedPhone || null,
        intention: intention || '',
        practice: practice || '',
        chakra: chakra || '',
        productSlug: topProduct?.slug || null,
        productTitle: topProduct?.title || null,
      },
    })

    // Score the lead + log funnel event (fire-and-forget, central tracker)
    getSessionId().then((sessionId) =>
      trackEvent({
        type: 'quiz_complete',
        email: sanitizedEmail,
        sessionId,
        source: 'quiz',
        chakra: chakra || null,
        metadata: { intention, practice },
      }),
    ).catch(() => {})

    // Send Email 1 (immediate alignment email) — fire-and-forget
    if (!lead.email1SentAt && topProduct) {
      emailService.sendQuizAlignment({
        to: sanitizedEmail,
        name: name?.trim() || null,
        chakra: chakra || '',
        intention: intention || '',
        productTitle: topProduct.title,
        productSlug: topProduct.slug,
        supportingProducts: supportingProducts.map((p) => ({
          title: p.title,
          slug: p.slug,
          chakra: p.chakra,
          pricePaise: p.pricePaise,
        })),
      }).then(async (result) => {
        if (result.success) {
          await prisma.quizLead.update({
            where: { id: lead.id },
            data: { email1SentAt: new Date() },
          })
          console.log('[quiz-lead] Email 1 sent:', sanitizedEmail)
        }
      }).catch((err) => {
        console.error('[quiz-lead] Email 1 failed:', err)
      })
    }

    // Send WhatsApp message — fire-and-forget, idempotent
    if (sanitizedPhone && !lead.whatsappSentAt && topProduct) {
      sendWhatsAppQuizRecommendation({
        phone: sanitizedPhone,
        productTitle: topProduct.title,
        productSlug: topProduct.slug,
        chakra: chakra || '',
        intention: intention || '',
      }).then(async (result) => {
        if (result.success) {
          await prisma.quizLead.update({
            where: { id: lead.id },
            data: { whatsappSentAt: new Date() },
          })
          console.log('[quiz-lead] WhatsApp sent:', sanitizedPhone)
        }
      }).catch((err) => {
        console.error('[quiz-lead] WhatsApp failed:', err)
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[quiz-lead] Error capturing lead:', error)
    return NextResponse.json(
      { error: 'Failed to save. Please try again.' },
      { status: 500 },
    )
  }
}
