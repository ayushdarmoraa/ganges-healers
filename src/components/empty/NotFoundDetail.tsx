import Link from 'next/link'

export default function NotFoundDetail({ backHref, backLabel }: { backHref: string; backLabel: string }) {
  return (
    <div className="container mx-auto p-6">
      <div className="mx-auto max-w-xl text-center py-16">
        <h1 className="text-2xl font-semibold mb-2">We can’t find that item.</h1>
        <p className="text-muted-foreground mb-4">It may have been moved or removed.</p>
        <Link href={backHref} className="text-primary underline">{backLabel}</Link>
      </div>
    </div>
  )
}