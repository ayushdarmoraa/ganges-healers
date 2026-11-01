import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { emailService } from '@/lib/email/email.service'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (!process.env.CRON_SECRET?.trim() || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Find leads where:
    // - Email 1 was sent (email1SentAt is set)
    // - Email 2 has NOT been sent yet
    // - Email 1 was sent at least 24 hours ago
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const pendingLeads = await prisma.quizLead.findMany({
      where: {
        email1SentAt: { not: null, lte: cutoff },
        email2SentAt: null,
        productSlug: { not: null },
        productTitle: { not: null },
      },
      take: 50,
    })

    let sent = 0
    let failed = 0

    for (const lead of pendingLeads) {
      const result = await emailService.sendQuizFollowUp({
        to: lead.email,
        name: lead.name,
        chakra: lead.chakra,
        intention: lead.intention,
        productTitle: lead.productTitle!,
        productSlug: lead.productSlug!,
      })

      if (result.success) {
        await prisma.quizLead.update({
          where: { id: lead.id },
          data: { email2SentAt: new Date() },
        })
        sent++
      } else {
        failed++
        console.error('[quiz-followup] Failed for:', lead.email)
      }
    }

    console.log(`[quiz-followup] Processed: ${sent} sent, ${failed} failed, ${pendingLeads.length} total`)

    return NextResponse.json({
      processed: pendingLeads.length,
      sent,
      failed,
    })
  } catch (error) {
    console.error('[quiz-followup] Cron error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
