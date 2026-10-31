import type { Metadata } from 'next'
import BlogManager from '@/components/blog/BlogManager'

export const metadata: Metadata = { title: 'Manage Articles | Ganges Healers' }
export default function BlogManagerPage() { return <BlogManager /> }
