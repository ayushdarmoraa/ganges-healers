import { readCourseForViewer } from '@/lib/courses/access'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Image from 'next/image'
import CourseEnrollButton from '@/components/courses/CourseEnrollButton'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const course = await readCourseForViewer(slug)
  if (!course) return { title: 'Course Not Found' }
  return {
    title: `${course.title} | Courses | Ganges Healers`,
    description: course.description.slice(0, 160),
  }
}

export default async function CourseDetailPage({ params }: Props) {
  const { slug } = await params

  const course = await readCourseForViewer(slug)

  if (!course) notFound()

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      {course.imageUrl && (
        <Image
          src={course.imageUrl}
          alt={course.title}
          width={800}
          height={224}
          className="w-full h-56 object-cover rounded-lg mb-6"
        />
      )}
      <h1 className="text-3xl font-bold mb-2">{course.title}</h1>
      {!course.isActive && <p className="mb-4 text-sm text-muted-foreground">This course is archived. Your existing lesson access is preserved.</p>}
      <p className="text-muted-foreground mb-4">
        {course._count.enrollments} student{course._count.enrollments !== 1 ? 's' : ''} enrolled
        {' · '}
        {course.lessons.length} lesson{course.lessons.length !== 1 ? 's' : ''}
      </p>
      <p className="mb-6 whitespace-pre-line">{course.description}</p>

      <div className="mb-8">
        <CourseEnrollButton course={course} />
      </div>

      <h2 className="text-xl font-semibold mb-3">Curriculum</h2>
      <ol className="space-y-2">
        {course.lessons.map((lesson, idx) => (
          <li key={lesson.id} className="flex items-center gap-3 p-3 rounded border">
            <span className="text-sm font-medium text-muted-foreground w-6 text-center">
              {idx + 1}
            </span>
            <span>{lesson.title}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
