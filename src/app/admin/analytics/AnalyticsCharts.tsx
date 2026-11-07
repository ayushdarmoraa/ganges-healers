'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'

interface ChartData {
  dailyRevenue: Array<{ date: string; revenue: number; orders: number }>
  revenueByChakra: Array<{ name: string; revenue: number; orders: number }>
  revenueBySource: Array<{ name: string; revenue: number; orders: number }>
  revenueByIntention: Array<{ name: string; revenue: number; orders: number }>
  topProducts: Array<{ name: string; revenue: number; sold: number }>
  revenueByVariant: Array<{ name: string; revenue: number; orders: number }>
}

const COLORS = ['#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#3b82f6', '#ec4899', '#06b6d4']

export default function AnalyticsCharts({ data }: { data: ChartData }) {
  return (
    <div className="space-y-8">
      {/* Revenue Trend (30 days) */}
      {data.dailyRevenue.length > 0 && (
        <ChartSection title="Revenue Trend (30 Days)">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data.dailyRevenue}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis />
              <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
              <Line type="monotone" dataKey="revenue" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartSection>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Revenue by Chakra */}
        {data.revenueByChakra.length > 0 && (
          <ChartSection title="Revenue by Chakra">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.revenueByChakra}
                  dataKey="revenue"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {data.revenueByChakra.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {/* Revenue by Source */}
        {data.revenueBySource.length > 0 && (
          <ChartSection title="Revenue by Source">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.revenueBySource}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Bar dataKey="revenue" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {/* Revenue by Intention */}
        {data.revenueByIntention.length > 0 && (
          <ChartSection title="Revenue by Intention">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.revenueByIntention} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {/* Top Products */}
        {data.topProducts.length > 0 && (
          <ChartSection title="Top Products by Revenue">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Bar dataKey="revenue" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}

        {/* A/B Variant Performance */}
        {data.revenueByVariant.length > 0 && (
          <ChartSection title="A/B Variant Performance">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.revenueByVariant}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString('en-IN')}`} />
                <Bar dataKey="revenue" fill="#ec4899" radius={[4, 4, 0, 0]} />
                <Bar dataKey="orders" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartSection>
        )}
      </div>
    </div>
  )
}

function ChartSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </div>
  )
}
