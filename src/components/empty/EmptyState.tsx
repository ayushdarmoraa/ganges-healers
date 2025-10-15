import type { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function EmptyState({ title, subtitle, action, icon }: { title: string; subtitle?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="border-dashed" role="status" aria-live="polite">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <h2 className="leading-none font-semibold flex items-center gap-2">
            {icon ? <span aria-hidden>{icon}</span> : null}
            <span>{title}</span>
          </h2>
        </CardTitle>
        {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
      </CardHeader>
      {action ? (
        <CardContent>
          <div className="mt-2">{action}</div>
        </CardContent>
      ) : null}
    </Card>
  )
}