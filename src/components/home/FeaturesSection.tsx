import { Card, CardContent } from "@/components/ui/card"
import { Users, Star, Headphones, Calendar } from "lucide-react"
import { prisma } from "@/lib/prisma"

export default async function SocialProofSection() {
  const [healerCount, serviceCount, audioCount, communityCount] =
    await Promise.all([
      prisma.healer.count({ where: { isActive: true, isVerified: true } }),
      prisma.service.count({ where: { isActive: true } }),
      prisma.audioTrack.count({ where: { isPublished: true } }),
      prisma.communityPost.count({ where: { deletedAt: null } }),
    ])

  const stats = [
    {
      label: "Verified Healers",
      value: healerCount,
      icon: Users,
    },
    {
      label: "Healing Services",
      value: serviceCount,
      icon: Star,
    },
    {
      label: "Audio Tracks",
      value: audioCount,
      icon: Headphones,
    },
    {
      label: "Community Posts",
      value: communityCount,
      icon: Calendar,
    },
  ]

  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-3">
        Explore Our Healing Community
      </h2>
      <p className="text-center text-muted-foreground mb-10 max-w-xl mx-auto">
        Find practitioners, discover healing services, and connect with
        others on their wellness journey.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex flex-col items-center py-8">
              <stat.icon className="h-8 w-8 text-primary mb-3" />
              <span className="text-3xl font-bold">{stat.value}</span>
              <span className="text-sm text-muted-foreground mt-1">
                {stat.label}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
