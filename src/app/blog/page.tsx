import { getPublishedBlogSummaries } from '@/lib/blog/queries'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import EmptyState from '@/components/empty/EmptyState'

export const metadata: Metadata = {
  title: 'Blog | Ganges Healers',
  description: 'Articles, insights, and updates on healing practices and wellness.',
}

export default async function BlogPage() {
  const posts = await getPublishedBlogSummaries()

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Blog</h1>

      {posts.length === 0 ? (
        <EmptyState
          title="No articles yet"
          subtitle="Check back soon — new content is being published."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group block rounded-lg border overflow-hidden hover:shadow-md transition-shadow"
            >
              {post.imageUrl && (
                <Image
                  src={post.imageUrl}
                  alt={post.title}
                  width={400}
                  height={200}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-4">
                <h2 className="font-semibold text-lg group-hover:text-primary transition-colors">
                  {post.title}
                </h2>
                {post.excerpt && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-3">
                    {post.excerpt}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  {format(new Date(post.createdAt), 'dd MMM yyyy')}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
