'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface TrackData {
  id: string
  slug: string
  title: string
  description: string | null
  category: string
  audioUrl: string | null
  duration: number
  isPremium: boolean
  locked: boolean
  reason?: string
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function AudioPlayerClient({ slug }: { slug: string }) {
  const { status, data: session } = useSession()
  const identity = `${slug}:${status}:${session?.user?.id || ''}`
  const [track, setTrack] = useState<TrackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedFor, setLoadedFor] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (status === 'loading') return
    const controller = new AbortController()
    setLoading(true); setError(null); setTrack(null)
    async function load() {
      try {
        const res = await fetch(`/api/audio/${encodeURIComponent(slug)}`, { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) {
          const data = await res.json()
          if (!controller.signal.aborted) setError(data.error || 'Track not found')
          return
        }
        const data = await res.json()
        if (!data || typeof data.title !== 'string' || typeof data.locked !== 'boolean' || typeof data.duration !== 'number' || !(data.audioUrl === null || typeof data.audioUrl === 'string')) throw new Error('Invalid track response')
        if (!controller.signal.aborted) setTrack(data)
      } catch {
        if (!controller.signal.aborted) setError('Failed to load track')
      } finally {
        if (!controller.signal.aborted) { setLoadedFor(identity); setLoading(false) }
      }
    }
    load()
    return () => controller.abort()
  }, [slug, status, identity, retry])

  if (loading || loadedFor !== identity) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2" />
          <div className="h-4 bg-muted rounded w-1/4" />
          <div className="h-16 bg-muted rounded" />
        </div>
      </div>
    )
  }

  if (error || !track || !track.locked && !track.audioUrl) {
    return (
      <div className="container mx-auto p-6 max-w-2xl text-center">
        <h1 className="text-xl font-semibold mb-2">Track Not Found</h1>
        <p className="text-muted-foreground mb-4">{error || 'The audio file is unavailable. Please try again later.'}</p>
        <Button variant="outline" className="mr-3" onClick={() => setRetry(value => value + 1)}>Retry audio</Button>
        <Button asChild variant="outline">
          <Link href="/audio">← Back to Audio Library</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <Link href="/audio" className="text-sm text-muted-foreground hover:text-primary mb-4 inline-block">
        ← Back to Audio Library
      </Link>

      <h1 className="text-3xl font-bold mb-2">{track.title}</h1>
      <p className="text-muted-foreground mb-1">
        {track.category} · {formatDuration(track.duration)}
        {track.isPremium && (
          <span className="ml-2 text-xs font-medium bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
            Premium
          </span>
        )}
      </p>

      {track.description && (
        <p className="text-muted-foreground mt-4 mb-6 whitespace-pre-line">{track.description}</p>
      )}

      {track.locked ? (
        <Card className="mt-6">
          <CardContent className="py-8 text-center space-y-3">
            <p className="font-medium">🔒 Premium Content</p>
            <p className="text-sm text-muted-foreground">{track.reason}</p>
            {status !== 'authenticated' ? (
              <Button asChild>
                <Link href="/auth/signin">Sign In</Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/dashboard/membership">Upgrade to VIP</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6">
          <AudioElement key={identity} url={track.audioUrl!} />
        </div>
      )}
    </div>
  )
}

function AudioElement({ url }: { url: string }) {
  const media = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const element = media.current
    // Strict Mode replays setup after cleanup; restore the source cleared by that cleanup.
    if (element && element.getAttribute('src') !== url) element.setAttribute('src', url)
    return () => { if (element) { element.pause(); element.removeAttribute('src'); element.load() } }
  }, [url])
  return <audio ref={media} controls src={url} className="w-full" preload="metadata">Your browser does not support the audio element.</audio>
}
