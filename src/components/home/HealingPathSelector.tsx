"use client"

import Link from "next/link"
import { Brain, Moon, Heart, Sparkles, Flame, Shield } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const healingPaths = [
  {
    label: "Anxiety & Stress",
    icon: Brain,
    href: "/services?search=hypnotherapy",
    color: "text-blue-500",
  },
  {
    label: "Sleep Issues",
    icon: Moon,
    href: "/audio?category=sleep",
    color: "text-indigo-500",
  },
  {
    label: "Emotional Healing",
    icon: Heart,
    href: "/services?search=healing",
    color: "text-rose-500",
  },
  {
    label: "Spiritual Growth",
    icon: Sparkles,
    href: "/services?search=reiki",
    color: "text-purple-500",
  },
  {
    label: "Confidence & Self-Worth",
    icon: Flame,
    href: "/audio?category=confidence",
    color: "text-amber-500",
  },
  {
    label: "Past Trauma",
    icon: Shield,
    href: "/services?search=hypnotherapy",
    color: "text-emerald-500",
  },
]

export default function HealingPathSelector() {
  return (
    <section className="py-16">
      <h2 className="text-3xl font-bold text-center mb-3">
        What Would You Like to Heal?
      </h2>
      <p className="text-center text-muted-foreground mb-10 max-w-xl mx-auto">
        Choose what resonates with you and we&apos;ll guide you to the right
        services, programs, and audio tracks.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {healingPaths.map((path) => (
          <Link key={path.label} href={path.href}>
            <Card className="hover:shadow-lg hover:border-primary/40 transition-all cursor-pointer group h-full">
              <CardContent className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <path.icon className={`h-10 w-10 mb-3 ${path.color} group-hover:scale-110 transition-transform`} />
                <span className="text-sm font-medium">{path.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
