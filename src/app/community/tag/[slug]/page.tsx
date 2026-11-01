import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCommunityTag } from '@/lib/community/tags'
import { Button } from '@/components/ui/button'
import PostFeed from '@/components/community/PostFeed'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Tagged Discussions | Ganges Healers' }

export default async function TaggedDiscussionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  const { slug } = await params
  const tag = await getCommunityTag(slug)
  if (!tag) notFound()
  return (
    <div className="container mx-auto max-w-3xl p-6 space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/community/tags">← All tags</Link></Button>
      <header className="space-y-2"><p className="text-sm font-medium text-primary">Community tag</p><h1 className="text-3xl font-semibold">#{tag.name}</h1><p className="text-muted-foreground">Explore discussions connected by this tag.</p></header>
      <PostFeed tagId={tag.id} />
    </div>
  )
}
