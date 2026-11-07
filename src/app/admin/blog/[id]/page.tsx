import type { Metadata } from 'next'
import BlogEditor from '@/components/blog/BlogEditor'

export const metadata: Metadata = { title: 'Edit Article | Ganges Healers' }
export default async function EditBlogArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <BlogEditor key={id} articleId={id} />
}
