import { prisma } from '@/lib/prisma'

interface CreateExperimentParams {
  key: string
  scope?: string
  variants?: { name: string; weight: number }[]
}

/**
 * Creates (or reactivates) an experiment in the DB.
 *
 * - If the key already exists and is active → returns it as-is.
 * - If the key exists but is inactive → reactivates it (if scope allows).
 * - Otherwise creates a new experiment with the given variants (default A/B 50/50).
 *
 * Mutual exclusion: only 1 active experiment per scope at a time.
 */
export async function createExperiment(
  params: CreateExperimentParams,
): Promise<{ id: string; key: string; isNew: boolean }> {
  const { key, scope, variants = [{ name: 'A', weight: 50 }, { name: 'B', weight: 50 }] } = params

  const existing = await prisma.experiment.findUnique({
    where: { key },
    select: { id: true, isActive: true },
  })

  if (existing?.isActive) {
    return { id: existing.id, key, isNew: false }
  }

  // Mutual exclusion: if scope is set, block if another active experiment owns the scope
  if (scope) {
    const scopeConflict = await prisma.experiment.findFirst({
      where: { scope, isActive: true, status: 'active', key: { not: key } },
      select: { id: true, key: true },
    })
    if (scopeConflict) {
      return { id: scopeConflict.id, key: scopeConflict.key, isNew: false }
    }
  }

  if (existing && !existing.isActive) {
    await prisma.experiment.update({
      where: { id: existing.id },
      data: { isActive: true, scope: scope ?? undefined },
    })
    return { id: existing.id, key, isNew: false }
  }

  const created = await prisma.experiment.create({
    data: {
      key,
      scope: scope ?? null,
      isActive: true,
      variants: {
        create: variants.map((v) => ({ name: v.name, weight: v.weight })),
      },
    },
  })

  return { id: created.id, key, isNew: true }
}
