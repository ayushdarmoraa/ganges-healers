"use client"

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import Link from 'next/link'
import { useSearch } from '@/lib/search/useSearch'
import { searchSuggestionGroups } from '@/lib/search/results'

/** Legacy inline search uses the same validation and request lifecycle as the live palette. */
export default function SearchBar() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const { results, status, retry } = useSearch(query, open)
  const groups = results ? searchSuggestionGroups(results) : []
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])
  return <div ref={wrapper} className="relative" onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
    <form className="flex items-center" onSubmit={event => { event.preventDefault(); if (query.trim().length >= 2) { setOpen(false); router.push(`/search?q=${encodeURIComponent(query.trim())}`) } }}>
      <div className="relative"><Search className="absolute left-2 top-2 size-4 text-muted-foreground" aria-hidden="true" /><input type="text" value={query} maxLength={200} onChange={event => { setQuery(event.target.value); setOpen(event.target.value.trim().length >= 2) }} onFocus={() => { if (query.trim().length >= 2) setOpen(true) }} placeholder="Search..." className="h-8 w-40 rounded border bg-background pl-8 pr-8 text-sm focus-ring md:w-56" aria-label="Search platform" />{query && <button type="button" onClick={() => { setQuery(''); setOpen(false) }} className="absolute right-2 top-2 focus-ring" aria-label="Clear search"><X className="size-3.5" /></button>}</div>
    </form>
    {open && query.trim().length >= 2 && <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-72 space-y-2 overflow-y-auto rounded border bg-background p-3 shadow-lg">
      {status === 'loading' ? <p role="status" className="text-sm">Searching…</p> : status === 'error' ? <div role="alert" className="text-sm"><p>Search could not be loaded.</p><button type="button" onClick={retry} className="underline focus-ring">Try again</button></div> : groups.length ? groups.map(group => <section key={group.title}><h3 className="text-xs font-semibold">{group.title}</h3>{group.items.map(item => <Link key={item.id} href={item.href} onClick={() => { setOpen(false); setQuery('') }} className="block rounded px-2 py-2 text-sm hover:bg-muted focus-ring">{item.label}</Link>)}</section>) : <p role="status" className="text-sm">No matches yet.</p>}
      <Link href={`/search?q=${encodeURIComponent(query.trim())}`} onClick={() => setOpen(false)} className="block border-t pt-2 text-sm underline">View all results for “{query.trim()}”</Link>
    </div>}
  </div>
}
