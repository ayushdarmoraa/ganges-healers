import { canonicalOf } from '@/config/site'

export default function ServiceLd({ service }: { service: { slug: string; title: string; shortDescription?: string | null; pricePaise?: number | null; ratingAvg?: number | null; imageUrl?: string | null } }) {
  const data: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.title,
    description: service.shortDescription || undefined,
    url: canonicalOf(`/services/${service.slug}`),
    provider: { '@type': 'Organization', name: 'Ganges Healers' },
  }
  if (typeof service.pricePaise === 'number') {
    data.offers = { '@type': 'Offer', priceCurrency: 'INR', price: (service.pricePaise / 100).toFixed(2) }
  }
  if (typeof service.ratingAvg === 'number') {
    data.aggregateRating = { '@type': 'AggregateRating', ratingValue: service.ratingAvg }
  }
  if (service.imageUrl) data.image = service.imageUrl
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}
