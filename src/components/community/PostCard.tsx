import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Heart, MessageCircle, Pin } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export interface CommunityPost {
  id: string
  title: string
  content: string
  isPinned: boolean
  createdAt: string
  user: { id: string; name: string | null; image: string | null }
  topic: { id: string; slug: string; name: string } | null
  tags: { tag: { id: string; slug: string; name: string } }[]
  _count: { comments: number; likes: number }
}

/** The same discussion card is used by the main feed and topic pages. */
export default function PostCard({ post }: { post: CommunityPost }) {
  return (
    <Link href={`/community/post/${post.id}`} aria-label={`Read discussion: ${post.title}`} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="hover:border-primary/50 transition-colors">
        <CardContent className="py-4 space-y-2">
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8">
              <AvatarImage src={post.user.image || ''} alt="" />
              <AvatarFallback>{post.user.name?.charAt(0).toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <p className="text-sm font-medium">{post.user.name || 'Anonymous'}</p>
              <time dateTime={post.createdAt} className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
              </time>
            </div>
            {post.isPinned && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Pin className="w-3 h-3" aria-hidden="true" /> Pinned
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {post.topic && <Badge variant="outline">{post.topic.name}</Badge>}
            {post.tags.map(({ tag }) => <Badge key={tag.id} variant="secondary" className="text-xs">{tag.name}</Badge>)}
          </div>
          <h2 className="text-lg font-semibold">{post.title}</h2>
          <p className="text-sm text-muted-foreground line-clamp-3">{post.content}</p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground pt-1">
            <span className="flex items-center gap-1" aria-label={`${post._count.likes} likes`}>
              <Heart className="w-4 h-4" aria-hidden="true" /> {post._count.likes}
            </span>
            <span className="flex items-center gap-1" aria-label={`${post._count.comments} comments`}>
              <MessageCircle className="w-4 h-4" aria-hidden="true" /> {post._count.comments}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
