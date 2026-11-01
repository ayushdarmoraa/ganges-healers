import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCommunityTags } from '@/lib/community/tags'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Community Tags | Ganges Healers' }

export default async function CommunityTagsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  const tags = await getCommunityTags()
  return (
    <div className="container mx-auto max-w-3xl p-6 space-y-6">
      <div className="flex flex-wrap gap-2"><Button asChild variant="ghost" size="sm"><Link href="/community">← Community</Link></Button><Button asChild variant="outline" size="sm"><Link href="/community/topics">Browse topics</Link></Button></div>
      <header className="space-y-2"><h1 className="text-3xl font-semibold">Explore Tags</h1><p className="text-muted-foreground">Follow an idea across different topics and conversations.</p></header>
      {tags.length ? <div className="flex flex-wrap gap-3">{tags.map(tag => <Link key={tag.id} href={`/community/tag/${encodeURIComponent(tag.slug)}`} className="rounded-full border px-4 py-2 text-sm hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">#{tag.name}</Link>)}</div> : <p className="rounded-lg border p-6 text-muted-foreground">No tags have been added yet. Browse the community to find a discussion.</p>}
    </div>
  )
}
