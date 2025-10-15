export type Crumb = { name: string; href: string }

function humanize(slug: string): string {
  return slug
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ')
}

export function makeServiceCrumbs(slug: string, title?: string): Crumb[] {
  return [
    { name: 'Home', href: '/' },
    { name: 'Services', href: '/services' },
    { name: title ?? humanize(slug), href: `/services/${slug}` },
  ]
}

export function makeProgramCrumbs(slug: string, title?: string): Crumb[] {
  return [
    { name: 'Home', href: '/' },
    { name: 'Programs', href: '/programs' },
    { name: title ?? humanize(slug), href: `/programs/${slug}` },
  ]
}

export function makeHealerCrumbs(slug: string, name?: string): Crumb[] {
  return [
    { name: 'Home', href: '/' },
    { name: 'Healers', href: '/healers' },
    { name: name ?? humanize(slug), href: `/healers/${slug}` },
  ]
}

export function makeProductCrumbs(slug: string, title?: string): Crumb[] {
  return [
    { name: 'Home', href: '/' },
    { name: 'Store', href: '/store' },
    { name: title ?? humanize(slug), href: `/store/${slug}` },
  ]
}
