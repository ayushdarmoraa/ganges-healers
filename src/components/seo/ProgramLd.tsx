import { canonicalOf } from '@/config/site'

export default function ProgramLd({ program }: { program: { slug: string; title: string; shortDescription?: string | null; sessionsCount?: number | null; pricePaise?: number | null; service?: { slug: string; title: string } | null } }) {
  const data: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: program.title,
    description: program.shortDescription || undefined,
    url: canonicalOf(`/programs/${program.slug}`),
    provider: { '@type': 'Organization', name: 'Ganges Healers' },
  }
  if (typeof program.pricePaise === 'number') {
    data.offers = { '@type': 'Offer', priceCurrency: 'INR', price: (program.pricePaise / 100).toFixed(2) }
  }
  if (typeof program.sessionsCount === 'number') {
    data.timeRequired = `${program.sessionsCount} sessions`
  }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}
