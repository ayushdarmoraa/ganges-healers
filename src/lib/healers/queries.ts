import { prisma } from '@/lib/prisma'

export type HealerListItem = {
  id: string
  slug: string
  name: string
  title: string | null
  yearsExperience: number
  ratingAvg: number
  reviewCount: number
  avatarUrl: string | null
  shortBio: string
  services: Array<{ slug: string; title: string }>
}

export type HealerDetail = HealerListItem & {
  longBio: string
  certifications: Array<string>
  languages: Array<string>
  gallery?: Array<string>
}

/** Read public rating summaries for the selected practitioners without loading review bodies. */
export async function getHealerReviewSummaries(healerIds: string[]) {
  if (healerIds.length === 0) return new Map<string, { ratingAvg: number; reviewCount: number }>()
  const summaries = await prisma.review.groupBy({
    by: ['healerId'],
    where: { healerId: { in: [...new Set(healerIds)] } },
    _avg: { rating: true },
    _count: { rating: true },
  })
  return new Map(summaries.map(summary => [summary.healerId, {
    ratingAvg: summary._avg.rating ?? 0,
    reviewCount: summary._count.rating,
  }]))
}

function specializationKeyFromServiceName(name: string) {
  const map: Record<string, string> = {
    'Yoga Therapy': 'Yoga',
    'Reiki Healing': 'Reiki',
    'Tarot Reading': 'Tarot',
  }
  return map[name] ?? name
}

export async function listHealers(params?: { serviceSlug?: string; q?: string; limit?: number; cursor?: string }): Promise<{ items: HealerListItem[]; nextCursor: string | null }> {
  const limit = Math.max(1, Math.min(params?.limit ?? 20, 50))
  const q = params?.q?.trim()

  // Optional filter by serviceSlug → translate to specialization key via service name
  let specializationFromService: string | undefined
  if (params?.serviceSlug) {
    const svc = await prisma.service.findUnique({ where: { slug: params.serviceSlug }, select: { name: true } })
    if (svc?.name) specializationFromService = specializationKeyFromServiceName(svc.name)
  }

  const where: any = { isActive: true } // eslint-disable-line @typescript-eslint/no-explicit-any
  if (q) {
    where.OR = [
      { bio: { contains: q, mode: 'insensitive' } },
      { user: { name: { contains: q, mode: 'insensitive' } } },
      // if q matches exactly one specialization key, include that as well
      { specializations: { has: q } },
    ]
  }
  if (specializationFromService) {
    where.AND = [...(where.AND || []), { specializations: { has: specializationFromService } }]
  }

  const cursor = params?.cursor ? { id: params.cursor } : undefined
  const healers = await prisma.healer.findMany({
    where,
    orderBy: { id: 'asc' },
    ...(cursor ? { cursor, skip: 1 } : {}),
    take: limit,
    select: {
      id: true,
      bio: true,
      experienceYears: true,
      specializations: true,
      user: { select: { name: true, image: true } },
    },
  })

  // Fetch all services once to map specializations → services
  const [allServices, ratings] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true }, select: { slug: true, name: true } }),
    getHealerReviewSummaries(healers.map(healer => healer.id)),
  ])

  const items: HealerListItem[] = healers.map((h) => {
    const name = h.user?.name || 'Healer'
    const title = h.specializations?.[0] ? `${h.specializations[0]} Healer` : null
    const services = (h.specializations || []).flatMap((spec) =>
      allServices
        .filter((s) => s.name.toLowerCase().includes(spec.toLowerCase()))
        .slice(0, 1)
        .map((s) => ({ slug: s.slug, title: s.name }))
    )
    return {
      id: h.id,
      slug: h.id, // No dedicated slug column yet; use id for stable routing
      name,
      title,
      yearsExperience: h.experienceYears ?? 0,
      ratingAvg: ratings.get(h.id)?.ratingAvg ?? 0,
      reviewCount: ratings.get(h.id)?.reviewCount ?? 0,
      avatarUrl: h.user?.image || null,
      shortBio: (h.bio || '').slice(0, 180),
      services,
    }
  })

  const nextCursor = healers.length === limit ? healers[healers.length - 1].id : null
  return { items, nextCursor }
}

export async function getHealerBySlug(slug: string): Promise<HealerDetail | null> {
  // slug is healer.id for now
  const h = await prisma.healer.findUnique({
    where: { id: slug, isActive: true },
    select: {
      id: true,
      bio: true,
      experienceYears: true,
      specializations: true,
      certifications: true,
      user: { select: { name: true, image: true } },
    },
  })
  if (!h) return null

  const [allServices, ratings] = await Promise.all([
    prisma.service.findMany({ where: { isActive: true }, select: { slug: true, name: true } }),
    getHealerReviewSummaries([h.id]),
  ])
  const rating = ratings.get(h.id)
  const services = (h.specializations || []).flatMap((spec) =>
    allServices
      .filter((s) => s.name.toLowerCase().includes(spec.toLowerCase()))
      .slice(0, 1)
      .map((s) => ({ slug: s.slug, title: s.name }))
  )

  const certifications = Array.isArray(h.certifications) ? h.certifications.flatMap(value => {
    const name = typeof value === 'string' ? value
      : value && typeof value === 'object' && !Array.isArray(value) && typeof value.name === 'string' ? value.name : ''
    return name.trim() ? [name.trim()] : []
  }) : []

  return {
    id: h.id,
    slug: h.id,
    name: h.user?.name || 'Healer',
    title: h.specializations?.[0] ? `${h.specializations[0]} Healer` : null,
    yearsExperience: h.experienceYears ?? 0,
    ratingAvg: rating?.ratingAvg ?? 0,
    reviewCount: rating?.reviewCount ?? 0,
    avatarUrl: h.user?.image || null,
    shortBio: (h.bio || '').slice(0, 180),
    services,
    longBio: h.bio || '',
    certifications: [...new Set(certifications)],
    languages: [],
    gallery: [],
  }
}
