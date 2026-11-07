"use client"

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

interface LessonData {
  id: string
  courseId: string
  title: string
  videoUrl: string | null
  content: string | null
  order: number
}

interface LessonNav {
  id: string
  title: string
  order: number
}

interface Props {
  courseSlug: string
  lessonId: string
}

export default function LessonPlayer({ courseSlug, lessonId }: Props) {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const [lesson, setLesson] = useState<LessonData | null>(null)
  const [allLessons, setAllLessons] = useState<LessonNav[]>([])
  const [progress, setProgress] = useState(0)
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    if (authStatus === 'loading') return
    if (!session?.user?.id) {
      router.push('/auth/signin')
      return
    }
    setLoading(true)
    fetch(`/api/courses/${encodeURIComponent(courseSlug)}/lessons/${encodeURIComponent(lessonId)}`)
      .then(r => {
        if (r.status === 403) { router.push(`/courses/${courseSlug}`); return null }
        if (!r.ok) throw new Error('Failed to load lesson')
        return r.json()
      })
      .then(data => {
        if (!data) return
        setLesson(data.lesson)
        setAllLessons(data.allLessons)
        setProgress(data.enrollment.progress)
      })
      .catch(() => toast.error('Failed to load lesson'))
      .finally(() => setLoading(false))
  }, [courseSlug, lessonId, session?.user?.id, authStatus, router])

  const markComplete = useCallback(async () => {
    if (!lesson) return
    setMarking(true)
    try {
      const res = await fetch(`/api/courses/${encodeURIComponent(courseSlug)}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonOrder: lesson.order }),
      })
      if (!res.ok) throw new Error('Failed to update progress')
      const data = await res.json()
      setProgress(data.progress)
      if (data.status === 'completed' && allLessons.length > 0 && allLessons.every(item => data.progress > item.order)) {
        toast.success('Course completed! 🎉')
      } else {
        toast.success('Lesson completed!')
      }

      // Auto-navigate to next lesson
      const currentIdx = allLessons.findIndex(l => l.id === lesson.id)
      if (currentIdx >= 0 && currentIdx < allLessons.length - 1) {
        const next = allLessons[currentIdx + 1]
        router.push(`/courses/${courseSlug}/lesson/${next.id}`)
      }
    } catch {
      toast.error('Failed to save progress')
    } finally {
      setMarking(false)
    }
  }, [lesson, courseSlug, allLessons, router])

  if (loading) return <div className="container mx-auto p-6">Loading lesson…</div>
  if (!lesson) return <div className="container mx-auto p-6">Lesson not found.</div>

  const currentIdx = allLessons.findIndex(l => l.id === lesson.id)
  const prevLesson = currentIdx > 0 ? allLessons[currentIdx - 1] : null
  const nextLesson = currentIdx < allLessons.length - 1 ? allLessons[currentIdx + 1] : null
  const isCompleted = progress > lesson.order

  return (
    <div className="container mx-auto p-6 max-w-5xl">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <div className="mb-4">
            <Link href={`/courses/${courseSlug}`} className="text-sm text-muted-foreground hover:underline">
              ← Back to course
            </Link>
          </div>

          <h1 className="text-2xl font-bold mb-4">{lesson.title}</h1>

          {lesson.videoUrl && (
            <div className="aspect-video mb-6 bg-black rounded-lg overflow-hidden">
              <iframe
                src={lesson.videoUrl}
                className="w-full h-full"
                allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                title={lesson.title}
              />
            </div>
          )}

          {lesson.content && (
            <div className="prose max-w-none mb-6 whitespace-pre-line">
              {lesson.content}
            </div>
          )}

          <div className="flex items-center gap-3 mt-6">
            {prevLesson && (
              <Link href={`/courses/${courseSlug}/lesson/${prevLesson.id}`}>
                <Button variant="outline">← Previous</Button>
              </Link>
            )}
            {!isCompleted ? (
              <Button onClick={markComplete} disabled={marking}>
                {marking ? 'Saving…' : 'Mark Complete & Continue'}
              </Button>
            ) : nextLesson ? (
              <Link href={`/courses/${courseSlug}/lesson/${nextLesson.id}`}>
                <Button>Next Lesson →</Button>
              </Link>
            ) : (
              <Button disabled variant="outline">Course Complete ✓</Button>
            )}
          </div>
        </div>

        {/* Sidebar: lesson list */}
        <aside className="lg:w-64 shrink-0">
          <h3 className="font-semibold mb-2 text-sm">Lessons</h3>
          <nav className="space-y-1">
            {allLessons.map((l, idx) => {
              const done = progress > l.order
              const active = l.id === lesson.id
              return (
                <Link
                  key={l.id}
                  href={`/courses/${courseSlug}/lesson/${l.id}`}
                  className={`block px-3 py-2 rounded text-sm transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                >
                  <span className="mr-2">{done ? '✓' : idx + 1}.</span>
                  {l.title}
                </Link>
              )
            })}
          </nav>
        </aside>
      </div>
    </div>
  )
}
