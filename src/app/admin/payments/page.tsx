import { requireAdmin } from '@/lib/rbac'
import MetricsDashboard from './ui/MetricsDashboard'

export const dynamic = 'force-dynamic'

export default async function AdminPaymentsPage() {
  await requireAdmin()
  return <MetricsDashboard />
}