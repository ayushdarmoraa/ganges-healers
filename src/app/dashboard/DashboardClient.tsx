'use client'

// Local client component for dashboard bookings list & invoice polling.

import React from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import BookingActions from '@/components/dashboard/BookingActions'

interface BookingRecord {
  id: string
  status: string
  scheduledAt: Date
  service: { name: string }
  healer: { user: { name: string | null } | null }
  payment: { id: string; paymentId?: string | null; gatewayPaymentId?: string | null; status: string | null; statusEnum: string | null; gateway: string | null } | null
}

interface CommunityPostRecord {
  id: string
  title: string
  createdAt: Date | string
  user: { name: string | null; image: string | null }
  _count: { comments: number; likes: number }
}

interface CourseEnrollmentRecord {
  id: string
  status: string
  progress: number
  course: {
    slug: string
    title: string
    imageUrl: string | null
    _count: { lessons: number }
  }
}

export default function DashboardClient({ bookings, recentPosts = [], courseEnrollments = [] }: { bookings: BookingRecord[]; recentPosts?: CommunityPostRecord[]; courseEnrollments?: CourseEnrollmentRecord[] }) {
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold">My Bookings</h1>

      {bookings.length === 0 && (
        <p className="text-muted-foreground">No bookings yet. Browse services to book your first session.</p>
      )}

      <div className="grid gap-4">
        {bookings.map((b) => {
          const hasSuccessPayment = b.payment && (b.payment.status === 'success' || b.payment.statusEnum === 'SUCCESS')
          return (
            <Card key={b.id}>
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="font-medium">{b.service.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(new Date(b.scheduledAt), 'EEE, dd MMM yyyy HH:mm')} · with {b.healer.user?.name ?? 'Healer'}
                  </div>
                  <div className="text-sm">
                    Status: <span className="font-medium">{b.status}</span> | Payment: {b.payment?.status ?? '-'} ({b.payment?.gateway ?? '-'})
                  </div>
                  {hasSuccessPayment && b.payment && (
                    <StaticInvoiceLink payment={b.payment} />
                  )}
                </div>
                {(b.status === 'PENDING' || b.status === 'CONFIRMED') && (
                  <BookingActions bookingId={b.id} scheduledAt={new Date(b.scheduledAt).toISOString()} />
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Community Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Community</h2>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/community/create">Create Post</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/community">View All →</Link>
            </Button>
          </div>
        </div>

        {recentPosts.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No community posts yet. Join the conversation!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {recentPosts.map((p) => (
              <Link href={`/community/post/${p.id}`} key={p.id}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{p.title}</p>
                      <p className="text-xs text-muted-foreground">
                        by {p.user.name || 'Anonymous'} · {p._count.likes} likes · {p._count.comments} comments
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <section className="rounded-lg border p-5 space-y-2"><h2 className="text-xl font-semibold">My Programs</h2><p className="text-sm text-muted-foreground">View your enrollments, confirmed appointments and session progress.</p><Button asChild variant="outline"><Link href="/dashboard/programs">View My Programs</Link></Button></section>

      {/* Courses Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">My Courses</h2>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/courses">Browse Courses</Link>
            </Button>
            {courseEnrollments.length > 0 && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/courses/enrolled">View All →</Link>
              </Button>
            )}
          </div>
        </div>

        {courseEnrollments.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              No courses yet. Browse our catalog to get started!
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {courseEnrollments.map((e) => {
              const total = e.course._count.lessons
              const pct = total > 0 ? Math.round((e.progress / total) * 100) : 0
              return (
                <Link href={`/courses/${e.course.slug}`} key={e.id}>
                  <Card className="hover:border-primary/50 transition-colors cursor-pointer">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium">{e.course.title}</p>
                        <span className="text-xs text-muted-foreground">
                          {e.progress}/{total} lessons
                          {e.status === 'completed' && <span className="ml-1 text-green-600">✓</span>}
                        </span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StaticInvoiceLink({ payment }: { payment: { id: string; paymentId?: string | null; gatewayPaymentId?: string | null } }) {
  const invId = payment.paymentId || payment.gatewayPaymentId || payment.id
  return (
    <div className="mt-2 text-xs text-muted-foreground">
      {invId ? (
        <a
          href={`/api/invoices/${invId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >Invoice</a>
      ) : (
        <span>Invoice: Generating…</span>
      )}
    </div>
  )
}
