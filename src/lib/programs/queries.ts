import { prisma } from '@/lib/prisma'

export type ProgramListItem = {
  id: string
  slug: string
  title: string
  shortDescription: string
  sessionsCount: number
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
    },
  })

  const items: ProgramListItem[] = rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    shortDescription: (r.description || '').slice(0, 180),
    sessionsCount: r.totalSessions,
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
    pricePaise: r.pricePaise,
    heroImageUrl: null,
    ratingAvg: null,
    serviceSlug: null,
  }
}
