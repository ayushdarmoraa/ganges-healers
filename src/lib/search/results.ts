import { z } from 'zod'

const id = z.string().min(1)
const slug = z.string().min(1).refine(value => value !== '.' && value !== '..')
const priced = z.object({ id, slug, title: z.string(), pricePaise: z.number().int().nonnegative() })

/** Public fields consumed by existing search clients; unexpected payloads are errors, not empty results. */
export const searchResultsSchema = z.object({
  services: z.array(z.object({ id, slug, name: z.string(), category: z.string(), tagline: z.string().nullable() })),
  healers: z.array(z.object({ id, bio: z.string().nullable(), specializations: z.array(z.string()), user: z.object({ name: z.string().nullable(), image: z.string().nullable() }) })),
  programs: z.array(priced),
  courses: z.array(priced.extend({ imageUrl: z.string().nullable() })),
  products: z.array(priced.extend({ imageUrl: z.string().nullable() })),
  blog: z.array(z.object({ id, slug, title: z.string(), excerpt: z.string().nullable(), createdAt: z.string() })),
  audio: z.array(z.object({ id, slug, title: z.string(), category: z.string(), duration: z.number().int().nonnegative(), isPremium: z.boolean() })),
})
export type SearchResults = z.infer<typeof searchResultsSchema>
export interface SearchSuggestion { id: string; label: string; description?: string; href: string }
export interface SearchSuggestionGroup { title: string; items: SearchSuggestion[] }

/** Build internal destinations from resource fields, never from a remote href. */
export function searchSuggestionGroups(results: SearchResults, limit = 3): SearchSuggestionGroup[] {
  const path = (prefix: string, value: string) => `${prefix}/${encodeURIComponent(value)}`
  return [
    { title: 'Services', items: results.services.slice(0, limit).map(row => ({ id: row.id, label: row.name, description: row.tagline || row.category, href: path('/services', row.slug) })) },
    { title: 'Healers', items: results.healers.slice(0, limit).map(row => ({ id: row.id, label: row.user.name || 'Healer', description: row.specializations.join(', '), href: path('/healers', row.id) })) },
    { title: 'Programs', items: results.programs.slice(0, limit).map(row => ({ id: row.id, label: row.title, href: path('/programs', row.slug) })) },
    { title: 'Courses', items: results.courses.slice(0, limit).map(row => ({ id: row.id, label: row.title, href: path('/courses', row.slug) })) },
    { title: 'Products', items: results.products.slice(0, limit).map(row => ({ id: row.id, label: row.title, href: path('/store', row.slug) })) },
    { title: 'Blog', items: results.blog.slice(0, limit).map(row => ({ id: row.id, label: row.title, description: row.excerpt || undefined, href: path('/blog', row.slug) })) },
    { title: 'Audio', items: results.audio.slice(0, limit).map(row => ({ id: row.id, label: row.title, description: row.category, href: path('/audio', row.slug) })) },
  ].filter(group => group.items.length > 0)
}
