import { prisma } from '@/lib/prisma'

/**
 * Stamps first-touch attribution on a User record.
 * Only writes if firstSource is still NULL (i.e., first time we see this user in the funnel).
 * Fire-and-forget — callers should `.catch(() => {})`.
 */
export async function stampFirstTouch(
  userId: string,
  source: string | null | undefined,
  variant: string | null | undefined,
): Promise<void> {
  if (!userId) return

  try {
    // Only update if firstSource is still null (atomic check-and-set)
    await prisma.user.updateMany({
      where: { id: userId, firstSource: null },
      data: {
        firstSource: source || 'direct',
        firstVariant: variant || 'unknown',
      },
    })
  } catch (err) {
    console.error('[first-touch] Error:', err)
  }
}
