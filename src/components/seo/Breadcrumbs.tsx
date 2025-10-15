import Link from 'next/link'
import type { Crumb } from '@/lib/seo/breadcrumbs'

export default function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (!Array.isArray(crumbs) || crumbs.length === 0) return null
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-3">
      <ol className="flex flex-wrap items-center gap-1">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <li key={`${c.href}-${i}`} className="flex items-center gap-1">
              {isLast ? (
                <span className="text-foreground/80 font-medium">{c.name}</span>
              ) : (
                <Link href={c.href} className="hover:underline">{c.name}</Link>
              )}
              {!isLast && <span className="px-1 text-foreground/40">›</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
