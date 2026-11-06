import { prisma } from "@/lib/prisma"
import Link from "next/link"
import { BookOpen, Headphones, Users, GraduationCap } from "lucide-react"

interface InternalLinksProps {
  serviceName: string
  category: string
}

export default async function InternalLinks({ serviceName, category }: InternalLinksProps) {
  // Search for relevant content across the platform
  const keyword = serviceName.toLowerCase()
  const categoryLower = category.toLowerCase().replace(/_/g, " ")

  const [blogPosts, audioTracks, programs, communityPosts] = await Promise.all([
    prisma.blogPost.findMany({
      where: {
        published: true,
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { title: { contains: categoryLower, mode: "insensitive" } },
        ],
      },
      take: 2,
      select: { slug: true, title: true },
    }),
    prisma.audioTrack.findMany({
      where: {
        isPublished: true,
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { category: { contains: categoryLower, mode: "insensitive" } },
        ],
      },
      take: 2,
      select: { slug: true, title: true },
    }),
    prisma.program.findMany({
      where: {
        isActive: true,
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { description: { contains: keyword, mode: "insensitive" } },
        ],
      },
      take: 2,
      select: { slug: true, title: true },
    }),
    prisma.communityPost.findMany({
      where: {
        deletedAt: null,
        OR: [
          { title: { contains: keyword, mode: "insensitive" } },
          { content: { contains: keyword, mode: "insensitive" } },
        ],
      },
      take: 2,
      select: { id: true, title: true },
    }),
  ])

  const hasLinks =
    blogPosts.length + audioTracks.length + programs.length + communityPosts.length > 0

  if (!hasLinks) return null

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Explore More</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {blogPosts.map((p) => (
          <Link
            key={p.slug}
            href={`/blog/${p.slug}`}
            className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
          >
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm">Read: {p.title}</span>
          </Link>
        ))}
        {audioTracks.map((t) => (
          <Link
            key={t.slug}
            href={`/audio/${t.slug}`}
            className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
          >
            <Headphones className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm">Listen: {t.title}</span>
          </Link>
        ))}
        {programs.map((p) => (
          <Link
            key={p.slug}
            href={`/programs/${p.slug}`}
            className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
          >
            <GraduationCap className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm">Program: {p.title}</span>
          </Link>
        ))}
        {communityPosts.map((p) => (
          <Link
            key={p.id}
            href={`/community/post/${p.id}`}
            className="flex items-center gap-2 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
          >
            <Users className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm">Discuss: {p.title}</span>
          </Link>
        ))}
      </div>
    </section>
  )
}
