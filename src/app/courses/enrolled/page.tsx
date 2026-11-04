"use client"

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import EmptyState from '@/components/empty/EmptyState'
import { Button } from '@/components/ui/button'

interface Enrollment {
  id: string
  status: string
  progress: number
  completedLessons: number
  course: {
    id: string
    slug: string
    title: string
    imageUrl: string | null
    _count: { lessons: number }
  }
}

export default function EnrolledCoursesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'loading') return
    if (!session?.user?.id) {
      router.push('/auth/signin')
      return
    }
    fetch('/api/courses/enrollments/me')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEnrollments(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [session?.user?.id, status, router])

  if (loading) return <div className="container mx-auto p-6">Loading…</div>

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">My Courses</h1>

      {enrollments.length === 0 ? (
        <EmptyState
          title="No courses yet"
          subtitle="Browse our catalog to get started."
          action={<Link href="/courses"><Button variant="secondary">Browse Courses</Button></Link>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {enrollments.map((e) => {
            const totalLessons = e.course._count.lessons
            const completedLessons = e.completedLessons
            const pct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0
            return (
              <Link
                key={e.id}
                href={`/courses/${e.course.slug}`}
                className="block rounded border p-4 hover:shadow-sm focus-ring"
              >
                {e.course.imageUrl && (
                  <Image src={e.course.imageUrl} alt={e.course.title} width={400} height={128} className="w-full h-32 object-cover rounded mb-3" />
                )}
                <div className="font-medium">{e.course.title}</div>
                <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {completedLessons}/{totalLessons} lessons · {pct}%
                  {e.status === 'completed' && totalLessons > 0 && completedLessons === totalLessons && <span className="ml-2 text-green-600 font-medium">✓ Completed</span>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
