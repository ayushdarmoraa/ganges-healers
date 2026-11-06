import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Headphones, Play } from "lucide-react"
import Link from "next/link"

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default async function FreeAudioExperience() {
  const tracks = await prisma.audioTrack.findMany({
    where: { isPremium: false, isPublished: true },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      category: true,
      duration: true,
    },
  })

  if (tracks.length === 0) return null

  return (
    <section className="py-16">
      <div className="flex items-center justify-center gap-2 mb-3">
        <Headphones className="h-6 w-6 text-primary" />
        <h2 className="text-3xl font-bold text-center">
          Free Guided Audio
        </h2>
      </div>
      <p className="text-center text-muted-foreground mb-10 max-w-xl mx-auto">
        Experience the power of guided healing — no sign-up required. Listen
        to free hypnosis and meditation tracks right now.
      </p>
      <div className="grid md:grid-cols-3 gap-6">
        {tracks.map((track) => (
          <Link key={track.id} href={`/audio/${track.slug}`}>
            <Card className="hover:shadow-lg hover:border-primary/40 transition-all group h-full">
              <CardContent className="py-6">
                <div className="flex items-start justify-between mb-3">
                  <Badge variant="secondary">{track.category}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(track.duration)}
                  </span>
                </div>
                <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                  {track.title}
                </h3>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                  {track.description}
                </p>
                <div className="flex items-center gap-2 text-primary text-sm font-medium">
                  <Play className="h-4 w-4" />
                  Listen Free
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <div className="text-center mt-10">
        <Button asChild size="lg" variant="outline" className="focus-ring">
          <Link href="/audio">Browse Full Audio Library</Link>
        </Button>
      </div>
    </section>
  )
}
