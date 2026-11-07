'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface TimelineEvent {
  id: string
  type: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface SessionData {
  sessionId: string
  eventCount: number
  durationMs: number
  stagesReached: string[]
  completed: boolean
  lastStage: string | null
  userId: string | null
  source: string | null
  chakra: string | null
  experimentVariant: string | null
  timeline: TimelineEvent[]
}

const EVENT_ICONS: Record<string, string> = {
  quiz_start: '📝',
  quiz_complete: '✅',
  product_view: '👁️',
  add_to_cart: '🛒',
  checkout_start: '💳',
  purchase: '🎉',
  abandoned_cart: '⚠️',
  bundle_view: '📦',
  bundle_click: '📦',
  bundle_purchase: '🎁',
}

export default function SessionReplayPage() {
  const params = useParams()
  const sessionId = params.sessionId as string
  const [data, setData] = useState<SessionData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/admin/session/${encodeURIComponent(sessionId)}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? 'Session not found' : 'Failed to load')
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e.message))
  }, [sessionId])

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold">Session Replay</h1>
        <div className="mt-4 text-red-600">{error}</div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold">Session Replay</h1>
        <div className="mt-4 text-muted-foreground">Loading…</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Session Replay</h1>
        <a href="/admin/analytics" className="text-sm text-muted-foreground hover:underline">← Analytics</a>
      </div>

      {/* Session summary */}
      <div className="rounded-xl border bg-card p-5 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Session</div>
            <div className="font-mono text-xs mt-0.5 truncate" title={data.sessionId}>{data.sessionId}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Events</div>
            <div className="font-semibold mt-0.5">{data.eventCount}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Duration</div>
            <div className="font-semibold mt-0.5">{formatDuration(data.durationMs)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Outcome</div>
            <div className={`font-semibold mt-0.5 ${data.completed ? 'text-green-600' : 'text-amber-600'}`}>
              {data.completed ? '✅ Purchased' : `⚠️ Dropped at ${data.lastStage}`}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mt-3 pt-3 border-t">
          <div><span className="text-muted-foreground">Source:</span> {data.source ?? '—'}</div>
          <div><span className="text-muted-foreground">Chakra:</span> {data.chakra ?? '—'}</div>
          <div><span className="text-muted-foreground">Variant:</span> {data.experimentVariant ?? '—'}</div>
          <div><span className="text-muted-foreground">User:</span> {data.userId ? data.userId.slice(0, 8) + '…' : 'Anonymous'}</div>
        </div>
      </div>

      {/* Timeline */}
      <h2 className="text-lg font-semibold mb-4">Event Timeline</h2>
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-border" />

        <div className="space-y-0">
          {data.timeline.map((evt, i) => {
            const prevTime = i > 0 ? new Date(data.timeline[i - 1].createdAt).getTime() : null
            const currentTime = new Date(evt.createdAt).getTime()
            const gap = prevTime !== null ? currentTime - prevTime : null

            return (
              <div key={evt.id} className="relative pl-10 pb-6">
                {/* Dot */}
                <div className="absolute left-2 top-1 w-5 h-5 rounded-full bg-background border-2 border-primary flex items-center justify-center text-xs">
                  {EVENT_ICONS[evt.type] ?? '•'}
                </div>

                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-medium">{evt.type}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(evt.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  {gap !== null && gap > 0 && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      +{formatDuration(gap)} since previous
                    </div>
                  )}
                  {evt.metadata && Object.keys(evt.metadata).length > 0 && (
                    <pre className="mt-2 text-xs bg-muted rounded p-2 overflow-x-auto">
                      {JSON.stringify(evt.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remSecs = secs % 60
  return `${mins}m ${remSecs}s`
}
