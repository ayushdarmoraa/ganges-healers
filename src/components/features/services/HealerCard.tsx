"use client"

import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Star, CheckCircle, Clock } from "lucide-react"
import BookingModal from "@/components/booking/BookingModal"
import { useCallback, useState, useMemo } from "react"
import { track } from "@/lib/analytics/client"

interface HealerCardProps {
  healer: {
    id: string
    bio: string | null
    experienceYears: number
    rating: number | null
    specializations: string[]
    isVerified: boolean
    availability: Record<string, { start: string; end: string }> | null
    user: { name: string | null; image: string | null }
    reviewCount: number
  }
  serviceId: string
  serviceName: string
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function getAvailabilitySignal(
  availability: Record<string, { start: string; end: string }> | null,
): string | null {
  if (!availability) return null
  const now = new Date()
  const todayName = dayNames[now.getDay()]
  if (availability[todayName]) return "Available today"
  // Find next available day
  for (let i = 1; i <= 7; i++) {
    const nextDay = dayNames[(now.getDay() + i) % 7]
    const slot = availability[nextDay]
    if (slot) {
      const label = i === 1 ? "Tomorrow" : nextDay
      return `Next: ${label} ${slot.start}`
    }
  }
  return null
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${
            i < full
              ? "text-amber-500 fill-amber-500"
              : i === full && half
                ? "text-amber-500 fill-amber-500/50"
                : "text-gray-300"
          }`}
        />
      ))}
    </span>
  )
}

export default function HealerCard({ healer, serviceId, serviceName }: HealerCardProps) {
  const [open, setOpen] = useState(false)
  const name = healer.user?.name ?? "Healer"
  const availSignal = useMemo(
    () => getAvailabilitySignal(healer.availability),
    [healer.availability],
  )

  const onOpen = useCallback(() => {
    setOpen(true)
    const match = typeof window !== "undefined" ? window.location.pathname.match(/\/services\/([^/?#]+)/) : null
    const serviceSlug = match?.[1] || serviceName.toLowerCase().replace(/\s+/g, "-")
    track("booking_modal_open", {
      serviceSlug,
      programSlug: undefined,
      source: "user-action",
      path: typeof window !== "undefined" ? window.location.pathname + window.location.search : "",
      ts: Date.now(),
    })
  }, [serviceName])

  return (
    <div className="rounded-lg border bg-card p-5 space-y-3" data-test="healer-card">
      <div className="flex items-start gap-3">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarImage src={healer.user.image || ""} alt={`${name} avatar`} />
          <AvatarFallback className="text-lg">
            {name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold">{name}</span>
            {healer.isVerified && (
              <Badge variant="secondary" className="gap-1 text-xs px-1.5 py-0">
                <CheckCircle className="h-3 w-3 text-emerald-600" />
                Verified
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            {healer.reviewCount > 0 ? <>
            <StarRating rating={healer.rating ?? 0} />
            <span className="text-sm text-muted-foreground">
              {(healer.rating ?? 0).toFixed(1)}
              {healer.reviewCount > 0 && ` (${healer.reviewCount})`}
            </span>
            </> : <span className="text-sm text-muted-foreground">No reviews yet</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {healer.experienceYears} years experience
          </p>
        </div>
      </div>

      {healer.bio && (
        <p className="text-sm text-muted-foreground line-clamp-2">{healer.bio}</p>
      )}

      {healer.specializations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {healer.specializations.slice(0, 4).map((s) => (
            <span
              key={s}
              className="text-xs rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {availSignal && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
          <Clock className="h-3.5 w-3.5" />
          {availSignal}
        </div>
      )}

      <Button onClick={onOpen} size="sm" className="w-full" data-test="book-btn" data-healer-id={healer.id} data-service-id={serviceId}>
        Book Session
      </Button>

      <BookingModal
        isOpen={open}
        onClose={() => setOpen(false)}
        healer={{
          id: healer.id,
          user: { name },
          experienceYears: healer.experienceYears,
          rating: healer.reviewCount > 0 ? healer.rating ?? 0 : 0,
        }}
        serviceId={serviceId}
        serviceName={serviceName}
      />
    </div>
  )
}
