"use client"
import { useEffect, useState, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend
} from 'recharts'

interface MetricsResponse {
  range: { from: string; to: string }
  kpi: {
    grossPaise: number; refundsPaise: number; netPaise: number; paymentsCount: number; refundsCount: number; aovPaise: number; mrrPaise: number
  }
  byType: Record<string, number>
  topPrograms: Array<{ programId: string; title: string; grossPaise: number }>
}
interface SeriesPoint { date: string; grossPaise: number; refundsPaise: number; netPaise: number; byType: Record<string, number> }

type RangeOpt = '7'|'30'|'90'
type TypeFilter = 'ALL' | 'SESSION' | 'PROGRAM' | 'MEMBERSHIP'

function formatINR(paise: number) { return `₹${(paise/100).toLocaleString('en-IN',{ minimumFractionDigits:2, maximumFractionDigits:2 })}` }

const TYPE_OPTIONS: Array<{label:string; value: TypeFilter}> = [
  { label: 'All', value: 'ALL' },
  { label: 'Session', value: 'SESSION' },
  { label: 'Program', value: 'PROGRAM' },
  { label: 'Membership', value: 'MEMBERSHIP' },
]

export default function MetricsDashboard() {
  const [range, setRange] = useState<RangeOpt>('30')
  const [type, setType] = useState<TypeFilter>('ALL')
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<MetricsResponse|null>(null)
  const [series, setSeries] = useState<SeriesPoint[]>([])
  const [payments, setPayments] = useState<any[]>([]) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [refunds, setRefunds] = useState<any[]>([]) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [tableLoading, setTableLoading] = useState(true)
  const [paymentsSort, setPaymentsSort] = useState<{field:'createdAt'|'amountPaise'; dir:'asc'|'desc'}>({ field: 'createdAt', dir: 'desc' })
  const [refundsSort, setRefundsSort] = useState<{field:'createdAt'|'amountPaise'; dir:'asc'|'desc'}>({ field: 'createdAt', dir: 'desc' })

  const dateRange = useMemo(() => {
    const to = new Date()
    const days = parseInt(range,10)
    const fromD = new Date(to.getTime() - (days-1)*24*60*60*1000)
    return { from: fromD.toISOString().slice(0,10), to: to.toISOString().slice(0,10) }
  }, [range])

  const fetchAll = useCallback(async () => {
    const { from, to } = dateRange
    const tFetch = performance.now()
    setLoading(true)
    try {
      const qsType = type ? `&type=${type}` : ''
      const [mResp, tsResp, latestResp, refundsResp] = await Promise.all([
        fetch(`/api/admin/payments/metrics?from=${from}&to=${to}${qsType}`),
        fetch(`/api/admin/payments/timeseries?from=${from}&to=${to}${qsType}`),
        fetch(`/api/admin/payments/latest?limit=20&type=${type}`),
        fetch(`/api/admin/payments/refunds?from=${from}&to=${to}&limit=20`)
      ])
      if (!mResp.ok || !tsResp.ok || !latestResp.ok || !refundsResp.ok) throw new Error('fetch_failed')
      const [mJson, tsJson, latestJson, refundsJson] = await Promise.all([mResp.json(), tsResp.json(), latestResp.json(), refundsResp.json()])
      setMetrics(mJson)
      setSeries(Array.isArray(tsJson) ? tsJson : tsJson.series || [])
      setPayments(latestJson.items || [])
      setRefunds(refundsJson.items || [])
      console.log('[admin][payments][ui_fetch]', { from, to, type, ms: Math.round(performance.now()-tFetch) })
    } catch (e) {
      console.error('[admin][payments][ui_error]', { from, to, type, error: e instanceof Error ? e.message : String(e) })
      toast.error('Failed to load analytics data')
    } finally {
      setLoading(false)
      setTableLoading(false)
    }
  }, [dateRange, type])

  useEffect(() => { setTableLoading(true); fetchAll() }, [fetchAll])

  const kpis = useMemo(() => {
    if (!metrics) return []
    return [
      { label: 'Gross', key: 'grossPaise', value: formatINR(metrics.kpi.grossPaise), raw: metrics.kpi.grossPaise },
      { label: 'Refunds', key: 'refundsPaise', value: formatINR(metrics.kpi.refundsPaise), raw: metrics.kpi.refundsPaise },
      { label: 'Net', key: 'netPaise', value: formatINR(metrics.kpi.netPaise), raw: metrics.kpi.netPaise },
      { label: 'Payments', key: 'paymentsCount', value: String(metrics.kpi.paymentsCount), raw: metrics.kpi.paymentsCount },
      { label: 'Refunds Cnt', key: 'refundsCount', value: String(metrics.kpi.refundsCount), raw: metrics.kpi.refundsCount },
      { label: 'AOV', key: 'aovPaise', value: formatINR(metrics.kpi.aovPaise), raw: metrics.kpi.aovPaise },
      { label: 'MRR', key: 'mrrPaise', value: formatINR(metrics.kpi.mrrPaise), raw: metrics.kpi.mrrPaise }
    ]
  }, [metrics])

  const sortedPayments = useMemo(() => {
    return [...payments].sort((a,b) => {
      const dir = paymentsSort.dir === 'asc' ? 1 : -1
      if (paymentsSort.field === 'createdAt') return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
      return (a.amountPaise - b.amountPaise) * dir
    })
  }, [payments, paymentsSort])

  const sortedRefunds = useMemo(() => {
    return [...refunds].sort((a,b) => {
      const dir = refundsSort.dir === 'asc' ? 1 : -1
      if (refundsSort.field === 'createdAt') return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir
      return (a.amountPaise - b.amountPaise) * dir
    })
  }, [refunds, refundsSort])

  function toggleSortPayments(field: 'createdAt'|'amountPaise') {
    setPaymentsSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' })
  }
  function toggleSortRefunds(field: 'createdAt'|'amountPaise') {
    setRefundsSort(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' })
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8" data-test="payments-analytics-root">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold">Payments Analytics</h1>
        <div className="flex flex-wrap gap-2 items-center">
          {(['7','30','90'] as const).map(d => (
            <Button key={d} variant={range===d?'default':'outline'} size="sm" onClick={()=>setRange(d)} data-test={`filter-range-${d}`}>{d}d</Button>
          ))}
          <select
            data-test="filter-type"
            className="h-8 rounded border px-2 text-sm bg-background"
            value={type}
            onChange={e=>setType(e.target.value as TypeFilter)}
          >
            {TYPE_OPTIONS.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4" data-test="kpi-row">
        {loading && Array.from({ length: 7 }).map((_,i)=>(<Skeleton key={i} className="h-20" />))}
        {!loading && metrics && kpis.map(k => (
          <Card key={k.key} data-test={`kpi-${k.key}`}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</div>
              <div className="text-lg font-semibold" data-test={`kpi-${k.key}-value`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
        {!loading && !metrics && <div className="col-span-full text-sm text-muted-foreground">No data</div>}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6" data-test="charts-section">
        <ChartCard title="Net Revenue (Daily)" loading={loading} empty={!loading && series.length===0} dataTest="chart-net">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={series} margin={{ left: 8, right: 8, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v:number)=> (v/100).toFixed(0)} />
              <Tooltip formatter={(v:number)=> formatINR(Number(v))} labelFormatter={(l:string)=>l} />
              <Line type="monotone" dataKey="netPaise" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard title="Gross by Type (Daily)" loading={loading} empty={!loading && series.length===0} dataTest="chart-by-type">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={series} stackOffset="expand" margin={{ left: 8, right: 8, top: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis fontSize={12} tickFormatter={(v:number)=> (v/100).toFixed(0)} />
              <Tooltip formatter={(v:number)=> formatINR(Number(v))} labelFormatter={(l:string)=>l} />
              <Legend />
              {['SESSION','PROGRAM','MEMBERSHIP','STORE','COURSE'].map((k,i)=> (
                <Bar key={k} dataKey={`byType.${k}`} stackId="gross" fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Tables */}
      <section className="grid lg:grid-cols-2 gap-8" data-test="tables-section">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Recent Payments</h3>
            <div className="flex gap-2 text-xs">
              <SortButton active={paymentsSort.field==='createdAt'} dir={paymentsSort.dir} label="Date" onClick={()=>toggleSortPayments('createdAt')} />
              <SortButton active={paymentsSort.field==='amountPaise'} dir={paymentsSort.dir} label="Amount" onClick={()=>toggleSortPayments('amountPaise')} />
            </div>
          </div>
          {tableLoading && <Skeleton className="h-48" />}
          {!tableLoading && !sortedPayments.length && <Empty message="No payments" />}
          {!tableLoading && sortedPayments.length>0 && (
            <div className="border rounded overflow-hidden" data-test="table-payments">
              <div className="grid grid-cols-5 bg-muted/50 text-xs font-medium px-2 py-1"> <div>Date</div><div>Type</div><div>Amount</div><div>Source</div><div>User</div></div>
              <div className="divide-y text-sm">
                {sortedPayments.map(p => (
                  <div key={p.id} className="grid grid-cols-5 px-2 py-1 items-center">
                    <span>{new Date(p.createdAt).toISOString().slice(0,10)}</span>
                    <span className="text-xs font-medium">{p.type || 'OTHER'}</span>
                    <span>{formatINR(p.amountPaise)}</span>
                    <span><SourcePill source={p.source} /></span>
                    <span className="text-muted-foreground" title={p.userId || ''}>{p.userId ? p.userId.slice(0,6) : '-'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-medium">Recent Refunds</h3>
            <div className="flex gap-2 text-xs">
              <SortButton active={refundsSort.field==='createdAt'} dir={refundsSort.dir} label="Date" onClick={()=>toggleSortRefunds('createdAt')} />
              <SortButton active={refundsSort.field==='amountPaise'} dir={refundsSort.dir} label="Amount" onClick={()=>toggleSortRefunds('amountPaise')} />
            </div>
          </div>
          {tableLoading && <Skeleton className="h-48" />}
          {!tableLoading && !sortedRefunds.length && <Empty message="No refunds" />}
          {!tableLoading && sortedRefunds.length>0 && (
            <div className="border rounded overflow-hidden" data-test="table-refunds">
              <div className="grid grid-cols-4 bg-muted/50 text-xs font-medium px-2 py-1"> <div>Date</div><div>Amount</div><div>Payment</div><div>Status</div></div>
              <div className="divide-y text-sm">
                {sortedRefunds.map(r => (
                  <div key={r.id} className="grid grid-cols-4 px-2 py-1 items-center">
                    <span>{new Date(r.createdAt).toISOString().slice(0,10)}</span>
                    <span>{formatINR(r.amountPaise)}</span>
                    <span className="text-muted-foreground" title={r.paymentId}>{r.paymentId.slice(0,6)}</span>
                    <span className="text-xs text-muted-foreground">—</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

// --- UI Helpers ---
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />
}
function Empty({ message }: { message: string }) {
  return <div className="text-xs text-muted-foreground px-2 py-4" data-test="empty-state">{message}</div>
}
function SortButton({ active, dir, label, onClick }: { active: boolean; dir: 'asc'|'desc'; label: string; onClick: ()=>void }) {
  return (
    <button type="button" onClick={onClick} className={`px-2 py-1 rounded border ${active? 'bg-primary text-primary-foreground':'bg-background'}`}>{label}{active? (dir==='asc'?' ↑':' ↓'):''}</button>
  )
}
const BAR_COLORS = ['#1d4ed8','#9333ea','#15803d','#92400e','#be123c']

function SourcePill({ source }: { source: string | null }) {
  if (!source) return <span className="text-muted-foreground">—</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px] font-medium">{source}</span>
}

function ChartCard({ title, children, loading, empty, dataTest }: { title: string; children: React.ReactNode; loading: boolean; empty: boolean; dataTest: string }) {
  return (
    <Card data-test={dataTest}>
      <CardContent className="p-4 space-y-2">
        <div className="text-sm font-medium">{title}</div>
        {loading && <Skeleton className="h-60" />}
        {!loading && empty && <Empty message="No data" />}
        {!loading && !empty && children}
      </CardContent>
    </Card>
  )
}