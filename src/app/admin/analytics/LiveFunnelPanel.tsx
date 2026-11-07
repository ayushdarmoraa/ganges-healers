'use client'

import { useEffect, useState, useCallback } from 'react'

interface LiveFunnelData {
  ts: string
  activeQuizUsers: number
  activeCarts: number
  recentOrders: number
  recentEvents: number
  eventBreakdown: Array<{ type: string; count: number }>
}

const POLL_INTERVAL = 10_000 // 10 seconds

export default function LiveFunnelPanel() {
  const [data, setData] = useState<LiveFunnelData | null>(null)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/live-funnel', { cache: 'no-store' })
      if (!res.ok) throw new Error('fetch error')
      const json = await res.json()
      setData(json)
      setError(false)
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchData])

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Live View</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={`inline-block w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500 animate-pulse'}`} />
          {error ? 'Disconnected' : 'Live'}
        </span>
      </div>

      {!data && !error && (
        <div className="text-sm text-muted-foreground">Loading…</div>
      )}

      {data && (
        <>
          {/* Primary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <LiveKpi label="Quiz Users" value={data.activeQuizUsers} sub="last 15 min" />
            <LiveKpi label="Active Carts" value={data.activeCarts} sub="last 60 min" />
            <LiveKpi label="Orders" value={data.recentOrders} sub="last 60 min" />
            <LiveKpi label="Total Events" value={data.recentEvents} sub="last 60 min" />
          </div>

          {/* Event Breakdown */}
          {data.eventBreakdown.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">Event Breakdown (60 min)</h3>
              <div className="space-y-1">
                {data.eventBreakdown.map((e) => (
                  <div key={e.type} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground font-mono">{e.type}</span>
                    <span className="font-semibold tabular-nums">{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 text-xs text-muted-foreground text-right">
            Updated {new Date(data.ts).toLocaleTimeString()}
          </div>
        </>
      )}
    </div>
  )
}

function LiveKpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
