import { canonicalOf } from '@/config/site'

export default function HealerLd({ healer }: { healer: { slug: string; name: string; title?: string | null; shortBio?: string | null; languages?: string[] | null; imageUrl?: string | null } }) {
  const data: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: healer.name,
    url: canonicalOf(`/healers/${healer.slug}`),
    description: healer.shortBio || undefined,
    jobTitle: healer.title || 'Healer',
  }
  if (healer.languages?.length) data.knowsLanguage = healer.languages
  if (healer.imageUrl) data.image = healer.imageUrl
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
}
