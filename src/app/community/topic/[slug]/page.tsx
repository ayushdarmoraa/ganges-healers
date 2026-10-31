import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getCommunityTopic } from '@/lib/community/topics'
import { Button } from '@/components/ui/button'
import TopicPosts from '@/components/community/TopicPosts'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Community Discussions | Ganges Healers' }

export default async function CommunityTopicPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  const { slug } = await params
  const topic = await getCommunityTopic(slug)
  if (!topic) notFound()

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/community/topics">← All topics</Link></Button>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-primary">Community topic</p>
          <h1 className="text-3xl font-semibold tracking-tight">{topic.name}</h1>
          {topic.description && <p className="text-muted-foreground leading-relaxed">{topic.description}</p>}
        </div>
        <Button asChild className="shrink-0"><Link href="/community/create">Create Post</Link></Button>
      </header>
      <TopicPosts key={topic.id} topicId={topic.id} />
    </div>
  )
}
