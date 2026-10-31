import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import PostFeed from '@/components/community/PostFeed'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'My Discussions | Ganges Healers' }

export default async function MyDiscussionsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  return (
    <div className="container mx-auto max-w-3xl p-6 space-y-6">
      <Button asChild variant="ghost" size="sm"><Link href="/community">← Community</Link></Button>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2"><h1 className="text-3xl font-semibold">My Discussions</h1><p className="text-muted-foreground">Find the conversations you’ve started and return to the replies.</p></div>
        <Button asChild><Link href="/community/create">Create Post</Link></Button>
      </header>
      <PostFeed mine />
    </div>
  )
}
