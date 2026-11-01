import PostFeed from '@/components/community/PostFeed'

export default function TopicPosts({ topicId, topicSlug }: { topicId: string; topicSlug: string }) {
  return <PostFeed topicId={topicId} topicSlug={topicSlug} />
}
