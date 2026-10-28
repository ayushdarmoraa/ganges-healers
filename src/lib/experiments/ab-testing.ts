import { cookies } from 'next/headers'
import { createHash } from 'crypto'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { EXPERIMENT_COOKIE_PREFIX as COOKIE_PREFIX, type Variant } from './client'

// Preserve existing imports for server callers; browser callers use ./client directly.
export { readVariantClient, readAllVariantsClient, type Variant } from './client'

const COOKIE_MAX_AGE = 90 * 24 * 60 * 60 // 90 days

/**
 * Stable salt for experiment hashing. Once set, NEVER change this value
 * or all logged-in users will be reassigned to different variants.
 */
const HASH_SALT = process.env.EXPERIMENT_HASH_SALT || 'ganges-healers-stable-v1'

/**
 * Deterministic variant assignment via SHA-256 hash.
 * Uses userId + experimentKey + stable salt to guarantee:
 *  - Same user always gets same variant (cross-device)
 *  - Changing the salt is the ONLY way to reassign (never do this)
 */
function deterministicVariant(
  userId: string,
  experimentKey: string,
  weights: Record<Variant, number>,
): Variant {
  const hash = createHash('sha256')
    .update(`${HASH_SALT}:${userId}:${experimentKey}`)
    .digest()
  // Use first 4 bytes as a 32-bit unsigned integer
  const value = hash.readUInt32BE(0)
  const totalWeight = weights.A + weights.B
  const bucket = value % totalWeight
  return bucket < weights.A ? 'A' : 'B'
}

/**
 * Returns the assigned variant for a given experiment key.
 * If no cookie exists, assigns one and sets the cookie so the user stays bucketed.
 *
 * Assignment priority:
 *  1. Existing cookie (already assigned)
 *  2. Logged-in userId → deterministic hash (cross-device consistency)
 *  3. Random assignment (anonymous users)
 *
 * Must be called in a Server Component or Route Handler (reads/writes cookies).
 */
export async function getVariant(
  experimentKey: string,
  weights: Record<Variant, number> = { A: 50, B: 50 },
): Promise<Variant> {
  const cookieStore = await cookies()
  const cookieName = `${COOKIE_PREFIX}${experimentKey}`
  const existing = cookieStore.get(cookieName)?.value

  if (existing === 'A' || existing === 'B') return existing

  // Try deterministic assignment by userId (cross-device consistency)
  let variant: Variant
  try {
    const session = await auth()
    if (session?.user?.id) {
      variant = deterministicVariant(session.user.id, experimentKey, weights)
    } else {
      const totalWeight = weights.A + weights.B
      const rand = Math.random() * totalWeight
      variant = rand < weights.A ? 'A' : 'B'
    }
  } catch {
    const totalWeight = weights.A + weights.B
    const rand = Math.random() * totalWeight
    variant = rand < weights.A ? 'A' : 'B'
  }

  cookieStore.set(cookieName, variant, {
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    httpOnly: false, // readable by client JS for analytics
    sameSite: 'lax',
  })

  return variant
}

/**
 * DB-backed variant assignment.
 * Reads weights from the Experiment model; falls back to 50/50 if not found.
 * Returns null if the experiment is inactive or not found.
 */
export async function getVariantFromDb(
  experimentKey: string,
): Promise<Variant | null> {
  const experiment = await prisma.experiment.findUnique({
    where: { key: experimentKey },
    include: { variants: true },
  })

  if (!experiment || !experiment.isActive) return null

  const weightA = experiment.variants.find((v) => v.name === 'A')?.weight ?? 50
  const weightB = experiment.variants.find((v) => v.name === 'B')?.weight ?? 50

  return getVariant(experimentKey, { A: weightA, B: weightB })
}

/**
 * Read all active experiment variants for the current user from cookies.
 * Useful for attaching to events/orders.
 */
export async function getAllVariants(): Promise<Record<string, Variant>> {
  const cookieStore = await cookies()
  const variants: Record<string, Variant> = {}
  for (const c of cookieStore.getAll()) {
    if (c.name.startsWith(COOKIE_PREFIX) && (c.value === 'A' || c.value === 'B')) {
      variants[c.name.slice(COOKIE_PREFIX.length)] = c.value as Variant
    }
  }
  return variants
}
