import { prisma } from '@/lib/prisma'

/**
 * Point values for each funnel action.
 * Higher score = warmer lead = more aggressive follow-up.
 */
const SCORES: Record<string, number> = {
  quiz_complete: 10,
  product_view: 20,
  add_to_cart: 30,
  checkout_start: 40,
  purchase: 50,
}

/**
 * Increment a quiz lead's score by the given action.
 * No-op if the email is not found.
 */
export async function incrementLeadScore(
  email: string,
  action: string,
): Promise<void> {
  const points = SCORES[action]
  if (!points) return

  try {
    await prisma.quizLead.updateMany({
      where: { email: email.toLowerCase().trim() },
      data: { score: { increment: points } },
    })
  } catch (err) {
    console.error('[lead-scoring] Failed to increment:', email, action, err)
  }
}
