import type { Metadata } from 'next'
import BlogEditor from '@/components/blog/BlogEditor'

export const metadata: Metadata = { title: 'New Article | Ganges Healers' }
export default function NewBlogArticlePage() { return <BlogEditor /> }
