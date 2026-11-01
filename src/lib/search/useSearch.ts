'use client'

import { useCallback, useEffect, useState } from 'react'
import { searchResultsSchema, type SearchResults } from './results'

interface SearchState { query: string; status: 'idle' | 'loading' | 'ready' | 'error'; results: SearchResults | null }

/** Shared debounce, validation, cancellation, and retry for the palette, legacy bar, and results page. */
export function useSearch(query: string, enabled = true, delay = 300) {
  const term = query.trim().slice(0, 200)
  const active = enabled && term.length >= 2
  const [state, setState] = useState<SearchState>({ query: '', status: 'idle', results: null })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const request = new AbortController()
    if (!active) { setState({ query: term, status: 'idle', results: null }); return }
    setState({ query: term, status: 'loading', results: null })
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: request.signal, cache: 'no-store' })
          if (!response.ok) throw new Error('Search failed')
          const results = searchResultsSchema.parse(await response.json())
          if (!request.signal.aborted) setState({ query: term, status: 'ready', results })
        } catch {
          if (!request.signal.aborted) setState({ query: term, status: 'error', results: null })
        }
      })()
    }, delay)
    return () => { clearTimeout(timer); request.abort() }
  }, [active, term, delay, revision])
  const retry = useCallback(() => setRevision(value => value + 1), [])
  // Hide the previous query in the render before effect cleanup, including when closing the palette.
  const current: SearchState = !active ? { query: term, status: 'idle', results: null } : state.query === term ? state : { query: term, status: 'loading', results: null }
  return { ...current, retry }
}
