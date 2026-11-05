import { prisma } from '@/lib/prisma'

export type ProgramListItem = {
  id: string
  slug: string
  title: string
  shortDescription: string
  sessionsCount: number
  sessionsPerWeek: number
  durationMinutes: number
  pricePaise: number
  heroImageUrl: string | null
  ratingAvg: number | null
}

export type ProgramDetail = ProgramListItem & {
  longDescription: string
  // Optional: if program is associated with a Service, expose its slug for UI-only navigation
  serviceSlug?: string | null
  // curriculum?: Array<{ title: string; minutes?: number }>
}

export async function listPrograms(params?: { serviceSlug?: string; q?: string; limit?: number; cursor?: string }): Promise<{ items: ProgramListItem[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(params?.limit ?? 20, 50))
  const q = params?.q?.trim()
  // Note: serviceSlug filtering omitted (no Program→Service relation in current schema)

  const where: any = { isActive: true } // eslint-disable-line @typescript-eslint/no-explicit-any
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
    ]
  }

  const cursor = params?.cursor ? { id: params.cursor } : undefined
  const rows = await prisma.program.findMany({
    where,
    orderBy: { id: 'asc' },
    ...(cursor ? { cursor, skip: 1 } : {}),
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      pricePaise: true,
      totalSessions: true,
      sessionsPerWeek: true,
      durationMinutes: true,
    },
  })

  const items: ProgramListItem[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: (r.description || '').slice(0, 180),
    sessionsCount: r.totalSessions,
    sessionsPerWeek: r.sessionsPerWeek,
    durationMinutes: r.durationMinutes,
    pricePaise: r.pricePaise,
    heroImageUrl: null,
    ratingAvg: null,
  }))
  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null
  return { items, nextCursor }
}

export async function getProgramBySlug(slug: string): Promise<ProgramDetail | null> {
  const r = await prisma.program.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      pricePaise: true,
      totalSessions: true,
      sessionsPerWeek: true,
      durationMinutes: true,
    },
  })
  if (!r) return null
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: (r.description || '').slice(0, 180),
    longDescription: r.description,
    sessionsCount: r.totalSessions,
    sessionsPerWeek: r.sessionsPerWeek,
    durationMinutes: r.durationMinutes,
    pricePaise: r.pricePaise,
    heroImageUrl: null,
    ratingAvg: null,
    serviceSlug: null,
  }
}

/** Admin catalog writes share enrollment's catalog lock; existing purchases are preserved. */
export async function writeProgramCatalog(actorId: string, input: unknown, id?: string) {
  const { programFields } = await import('./schedule')
  const { lockTransaction } = await import('@/lib/db/locks')
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } })
  if (actor?.role !== 'ADMIN') throw Object.assign(new Error('Forbidden'), { status: 403 })
  const parsed = (id ? programFields.omit({ slug: true }) : programFields).safeParse(input)
  if (!parsed.success) throw Object.assign(new Error('Invalid program fields'), { status: 400 })
  if (!id) return prisma.program.create({ data: programFields.parse(input) })
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'program', `catalog:${id}`)
    return tx.program.update({ where: { id }, data: parsed.data })
  })
}

/** A catalog deletion archives purchased programs rather than cascading away paid enrollments. */
export async function archiveProgramCatalog(actorId: string, id: string, expectedActive?: boolean) {
  const { lockTransaction } = await import('@/lib/db/locks')
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { role: true } })
  if (actor?.role !== 'ADMIN') throw Object.assign(new Error('Forbidden'), { status: 403 })
  return prisma.$transaction(async tx => {
    await lockTransaction(tx, 'program', `catalog:${id}`)
    const program = await tx.program.findUnique({ where: { id }, select: { isActive: true } })
    if (!program) return null
    if (expectedActive !== undefined) {
      if (program.isActive !== expectedActive) return program
      return tx.program.update({ where: { id }, data: { isActive: !expectedActive } })
    }
    if (await tx.programEnrollment.count({ where: { programId: id } })) return tx.program.update({ where: { id }, data: { isActive: false } })
    return tx.program.delete({ where: { id } })
  })
}
