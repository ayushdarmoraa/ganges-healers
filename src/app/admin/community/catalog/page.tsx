import type { Metadata } from 'next'
import CommunityCatalog from '@/components/community/CommunityCatalog'

export const metadata: Metadata = { title: 'Community Topics & Tags | Ganges Healers' }

export default function CommunityCatalogPage() {
  return <CommunityCatalog />
}
