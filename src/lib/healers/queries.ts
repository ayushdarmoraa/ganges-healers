import { prisma } from '@/lib/prisma'

export type HealerListItem = {
  id: string
  slug: string
  name: string
  title: string | null
  yearsExperience: number
  ratingAvg: number
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
      rating: true,
      specializations: true,
      user: { select: { name: true, image: true } },
    },
  })

  // Fetch all services once to map specializations → services
  const allServices = await prisma.service.findMany({ select: { slug: true, name: true } })

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
      ratingAvg: Number(h.rating ?? 0),
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
    where: { id: slug },
    select: {
      id: true,
      bio: true,
      experienceYears: true,
      rating: true,
      specializations: true,
      certifications: true,
      user: { select: { name: true, image: true } },
    },
  })
  if (!h) return null

  const allServices = await prisma.service.findMany({ select: { slug: true, name: true } })
  const services = (h.specializations || []).flatMap((spec) =>
    allServices
      .filter((s) => s.name.toLowerCase().includes(spec.toLowerCase()))
      .slice(0, 1)
      .map((s) => ({ slug: s.slug, title: s.name }))
  )

  return {
    id: h.id,
    slug: h.id,
    name: h.user?.name || 'Healer',
    title: h.specializations?.[0] ? `${h.specializations[0]} Healer` : null,
    yearsExperience: h.experienceYears ?? 0,
    ratingAvg: Number(h.rating ?? 0),
    avatarUrl: h.user?.image || null,
    shortBio: (h.bio || '').slice(0, 180),
    services,
    longBio: h.bio || '',
  certifications: Array.isArray(h.certifications) ? (h.certifications as unknown[]).map((x) => String(x)) : [],
    languages: [],
    gallery: [],
  }
}
