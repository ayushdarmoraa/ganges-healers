import { getPublishedBlogSummaries } from '@/lib/blog/queries'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { BookOpen } from "lucide-react"
import { format } from "date-fns"
import Link from "next/link"

export default async function BlogPreview() {
  const posts = await getPublishedBlogSummaries(3)

  if (posts.length === 0) return null

  return (
    <section className="py-16">
      <div className="flex items-center justify-center gap-2 mb-3">
        <BookOpen className="h-6 w-6 text-primary" />
        <h2 className="text-3xl font-bold text-center">
          Latest from the Blog
        </h2>
      </div>
      <p className="text-center text-muted-foreground mb-10 max-w-xl mx-auto">
        Insights, tips, and stories on healing, growth, and spiritual
        awareness.
      </p>
      <div className="grid md:grid-cols-3 gap-6">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.slug}`}>
            <Card className="hover:shadow-lg hover:border-primary/40 transition-all group h-full overflow-hidden">
              {post.imageUrl && (
                <div className="h-40 bg-muted overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.imageUrl}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  />
                </div>
              )}
              <CardContent className="py-5">
                <p className="text-xs text-muted-foreground mb-2">
                  {format(post.createdAt, "MMM d, yyyy")}
                </p>
                <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors line-clamp-2">
                  {post.title}
                </h3>
                {post.excerpt && (
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {post.excerpt}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="text-center mt-10">
        <Button asChild size="lg" variant="outline" className="focus-ring">
          <Link href="/blog">Read More Articles</Link>
        </Button>
      </div>
    </section>
  )
}
