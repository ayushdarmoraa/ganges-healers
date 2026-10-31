import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import CreatePostForm from '@/components/community/CreatePostForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Create a Community Post | Ganges Healers' }

export default async function CreatePostPage({ searchParams }: {
  searchParams: Promise<{ topic?: string | string[] }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  const query = await searchParams
  const topic = typeof query.topic === 'string' ? query.topic : ''
  return <CreatePostForm key={`${session.user.id}:${topic}`} draftOwnerId={session.user.id} initialTopicSlug={topic} />
}
