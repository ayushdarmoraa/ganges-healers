'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { NotificationPanel } from '@/components/navigation/NotificationPanel'
import { useNotifications } from './NotificationProvider'

/** The bell and full inbox share confirmed server state through NotificationProvider. */
export default function NotificationBell({ closeWhen = false }: { closeWhen?: boolean }) {
  const { ownerId, notifications, unreadCount, status, refresh, markRead, markAllRead, pendingIds, markingAll, actionError } = useNotifications()
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  useEffect(() => { setOpen(false) }, [ownerId])
  useEffect(() => { if (closeWhen) setOpen(false) }, [closeWhen])
  useEffect(() => {
    if (!open) return
    const outside = (event: MouseEvent) => { if (!wrapper.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  if (!ownerId) return null
  return <div ref={wrapper} className="relative">
    <button ref={trigger} type="button" onClick={() => setOpen(value => !value)} className="relative rounded p-2 hover:bg-muted focus-ring" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} data-unread-count={unreadCount}>
      <Bell className="size-5" aria-hidden="true" />
      {unreadCount > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    <NotificationPanel id={panelId} open={open} onOpenChange={setOpen} className="absolute right-0 top-full z-50 mt-2" loading={status === 'loading'} error={status === 'error' || status === 'unauthorized'}
      errorState={<div className="space-y-2 p-4 text-sm">{status === 'unauthorized' ? <Link href="/auth/signin" className="underline">Sign in to load your notifications</Link> : <><p role="alert">Notifications could not be loaded.</p><button type="button" onClick={() => void refresh()} className="underline focus-ring">Try again</button></>}</div>}
      emptyState={<p className="p-4 text-sm text-muted-foreground">No notifications yet. Activity on your community discussions will appear here.</p>}
      viewAllHref="/dashboard/notifications" onMarkAllRead={() => void markAllRead()} markAllDisabled={!unreadCount || pendingIds.size > 0 || markingAll || status !== 'ready'} onMarkRead={id => { if (!markingAll && status === 'ready') void markRead(id, true) }} pendingIds={pendingIds}
      readDisabled={markingAll || status !== 'ready'} notice={actionError ? <p role="alert" className="px-4 py-3 text-sm text-destructive">{actionError}</p> : undefined}
      groups={notifications.length ? [{ title: 'Recent activity', items: notifications.map(item => ({ ...item, time: formatDistanceToNow(new Date(item.createdAt), { addSuffix: true }) })) }] : []} />
  </div>
}
