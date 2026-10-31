import type { Metadata } from 'next'
import CreatePostForm from '@/components/community/CreatePostForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Create a Community Post | Ganges Healers' }

export default async function CreatePostPage({ searchParams }: {
  searchParams: Promise<{ topic?: string | string[] }>
}) {
  const query = await searchParams
  const topic = typeof query.topic === 'string' ? query.topic : ''
  return <CreatePostForm key={topic} initialTopicSlug={topic} />
}
