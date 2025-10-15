import type { Crumb } from '@/lib/seo/breadcrumbs'
import { canonicalOf } from '@/config/site'

export default function BreadcrumbsLd({ crumbs }: { crumbs: Crumb[] }) {
  if (!Array.isArray(crumbs) || crumbs.length === 0) return null
  const json = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: canonicalOf(c.href),
    })),
  }
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />
  )
}
