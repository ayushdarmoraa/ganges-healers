import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import CourseManager from '@/components/courses/CourseManager'

export default async function AdminCoursesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth/signin')
  try { await requireCurrentAdmin() } catch { redirect('/') }
  return <CourseManager />
}
