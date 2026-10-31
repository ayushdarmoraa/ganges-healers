"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SearchSuggestionGroup } from "@/lib/search/results";

export interface SearchPaletteSection {
  title: string;
  items: Array<{ label: string; description?: string; href?: string }>;
}
export interface SearchPaletteProps {
  id?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  onSubmit?: () => void;
  onNavigate?: () => void;
  onCloseFocus?: () => void;
  placeholder?: string;
  title?: string;
  description?: string;
  recentSearches?: SearchPaletteSection;
  quickLinks?: SearchPaletteSection;
  popularSearches?: SearchPaletteSection;
  resultGroups?: SearchSuggestionGroup[];
  viewAllHref?: string;
  emptyState?: ReactNode;
  loadingState?: ReactNode;
  loading?: boolean;
  empty?: boolean;
  error?: boolean;
  onRetry?: () => void;
  shortcutLabel?: string;
  className?: string;
}

/** Search presentation stays reusable; the mounted navbar owns fetching and navigation. */
export function SearchPalette({
  id, open = false, onOpenChange, query = "", onQueryChange, onSubmit, onNavigate, onCloseFocus,
  placeholder = "Search programs, services, and more", title = "Search", description = "Find services, healers, programs, courses, products, articles, and audio.",
  recentSearches, quickLinks, popularSearches, resultGroups = [], viewAllHref,
  emptyState, loadingState, loading = false, empty = false, error = false, onRetry,
  shortcutLabel = "⌘K / Ctrl+K", className,
}: SearchPaletteProps) {
  const content = useRef<HTMLDivElement>(null);
  const navigate = () => { onNavigate?.(); onOpenChange?.(false); };
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent id={id} ref={content} className={cn("max-w-2xl gap-0 overflow-hidden p-0", className)} aria-label={title}
      onCloseAutoFocus={event => { if (onCloseFocus) { event.preventDefault(); onCloseFocus(); } }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp'].includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
        const stops = Array.from(content.current?.querySelectorAll<HTMLElement>('input, [data-search-result]') || []);
        if (stops.length < 2 || !stops.includes(document.activeElement as HTMLElement)) return;
        event.preventDefault();
        const index = stops.indexOf(document.activeElement as HTMLElement);
        stops[(index + (event.key === 'ArrowDown' ? 1 : -1) + stops.length) % stops.length].focus();
      }}>
      <div className="border-b p-4 sm:p-6">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <form className="mt-4 flex gap-2" onSubmit={event => { event.preventDefault(); if (query.trim().length >= 2) onSubmit?.(); }}>
          <input value={query} readOnly={!onQueryChange} onChange={event => onQueryChange?.(event.target.value)} maxLength={200} placeholder={placeholder} className="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm focus-ring" aria-label="Search input" />
          <button type="submit" disabled={query.trim().length < 2} className="rounded border px-3 text-sm focus-ring disabled:opacity-50">Search</button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">{shortcutLabel} · Use Tab or arrow keys to browse suggestions</p>
      </div>
      <div className="max-h-[60vh] space-y-5 overflow-y-auto p-4 sm:p-6" aria-busy={loading}>
        {loading ? loadingState ?? <p role="status">Loading suggestions…</p> : error ? <div role="alert" className="space-y-2"><p>Search could not be loaded. Please try again.</p><button type="button" onClick={onRetry} className="underline focus-ring">Try again</button></div> : query.trim().length >= 2 ? empty || !resultGroups.length ? emptyState ?? <p role="status">No matches yet. Try a broader search term.</p> : <>
          <p className="text-sm text-muted-foreground" role="status">Suggestions for “{query.trim()}”</p>
          {resultGroups.map(group => <section key={group.title}><h3 className="mb-2 text-sm font-semibold">{group.title}</h3><ul className="space-y-1">{group.items.map(item => <li key={item.id}><Link data-search-result href={item.href} onClick={navigate} className="block rounded px-3 py-2 text-sm hover:bg-accent focus-ring"><span className="block font-medium">{item.label}</span>{item.description && <span className="block truncate text-xs text-muted-foreground">{item.description}</span>}</Link></li>)}</ul></section>)}
        </> : <>
          <p className="text-sm text-muted-foreground">Enter at least two characters, or browse a destination below.</p>
          {[recentSearches, quickLinks, popularSearches].filter((section): section is SearchPaletteSection => Boolean(section)).map(section => <section key={section.title}><h3 className="mb-2 text-sm font-semibold">{section.title}</h3><ul className="grid gap-2 sm:grid-cols-2">{section.items.map(item => <li key={item.label}>{item.href ? <Link data-search-result href={item.href} onClick={navigate} className="block rounded border px-3 py-2 text-sm hover:bg-accent focus-ring">{item.label}{item.description && <span className="ml-2 text-muted-foreground">{item.description}</span>}</Link> : <button type="button" onClick={() => onQueryChange?.(item.label)} className="rounded border px-3 py-2 text-sm focus-ring">{item.label}</button>}</li>)}</ul></section>)}
        </>}
        {viewAllHref && query.trim().length >= 2 && <Link href={viewAllHref} onClick={navigate} className="block border-t pt-3 text-sm font-medium underline focus-ring">View all results for “{query.trim()}”</Link>}
      </div>
    </DialogContent>
  </Dialog>;
}
export default SearchPalette;
