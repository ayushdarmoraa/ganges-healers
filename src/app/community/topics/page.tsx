import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, MessageCircle } from 'lucide-react'
import { auth } from '@/lib/auth'
import { getCommunityTopics } from '@/lib/community/topics'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Community Topics | Ganges Healers' }

export default async function CommunityTopicsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  const topics = await getCommunityTopics()

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-8">
      <Button asChild variant="ghost" size="sm"><Link href="/community">← Back to Community</Link></Button>
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary">A space to connect</p>
        <h1 className="text-3xl font-semibold tracking-tight">Community Topics</h1>
        <p className="text-muted-foreground max-w-2xl">Find conversations around your interests. Share experiences, ask questions, and learn alongside others on their healing journey.</p>
      </header>
      {topics.length ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {topics.map(topic => (
            <Link key={topic.id} href={`/community/topic/${encodeURIComponent(topic.slug)}`} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Card className="h-full transition-colors group-hover:border-primary/50">
                <CardContent className="p-6 space-y-3">
                  <MessageCircle className="h-6 w-6 text-primary" aria-hidden="true" />
                  <h2 className="text-lg font-semibold">{topic.name}</h2>
                  {topic.description && <p className="text-sm leading-relaxed text-muted-foreground">{topic.description}</p>}
                  <p className="flex items-center gap-2 text-sm font-medium text-primary">View discussions <ArrowRight className="h-4 w-4" aria-hidden="true" /></p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card><CardContent className="py-12 text-center space-y-2">
          <h2 className="text-lg font-medium">Topics are coming soon</h2>
          <p className="text-sm text-muted-foreground">You can still explore all discussions in the community.</p>
          <Button asChild variant="outline"><Link href="/community">Browse discussions</Link></Button>
        </CardContent></Card>
      )}
    </div>
  )
}
