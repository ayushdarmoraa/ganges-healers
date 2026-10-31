'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import type { NotificationItem, NotificationList } from '@/lib/notifications/types'

interface Summary {
  ownerId: string | null
  notifications: NotificationItem[]
  unreadCount: number
  status: 'loading' | 'ready' | 'error' | 'unauthorized'
}
interface Actions { ownerId: string | null; pending: Set<string>; all: boolean; error: string | null }
interface NotificationContextValue extends Summary {
  sessionLoading: boolean
  pendingIds: ReadonlySet<string>
  markingAll: boolean
  actionError: string | null
  changeVersion: number
  refresh: () => Promise<void>
  markRead: (id: string, read: boolean) => Promise<boolean>
  markAllRead: () => Promise<boolean>
}
const Context = createContext<NotificationContextValue | null>(null)
const empty = (ownerId: string | null): Summary => ({ ownerId, notifications: [], unreadCount: 0, status: ownerId ? 'loading' : 'unauthorized' })

/** One account-scoped summary drives the bell and inbox, using server counts rather than optimistic arithmetic. */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { data: session, status: sessionStatus, update } = useSession()
  const ownerId = session?.user?.id || null
  const owner = useRef(ownerId)
  const updateSession = useRef(update)
  const controller = useRef<AbortController | null>(null)
  const generation = useRef(0)
  const accountEpoch = useRef(0)
  const pending = useRef(new Set<string>())
  const channel = useRef<BroadcastChannel | null>(null)
  const [summary, setSummary] = useState<Summary>(() => empty(ownerId))
  const [actions, setActions] = useState<Actions>({ ownerId, pending: new Set(), all: false, error: null })
  const [changeVersion, setChangeVersion] = useState(0)

  useEffect(() => { updateSession.current = update }, [update])

  const endAccountScope = useCallback(() => {
    generation.current++; accountEpoch.current++; controller.current?.abort(); owner.current = null
  }, [])

  const changedAccount = useCallback(() => {
    generation.current++; controller.current?.abort()
    setSummary({ ...empty(owner.current), status: 'unauthorized' })
    if (updateSession.current) void updateSession.current().catch(() => {})
  }, [])

  const refresh = useCallback(async () => {
    const uid = owner.current
    if (!uid) return
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    const sequence = ++generation.current
    try {
      const response = await fetch('/api/notifications', { signal: request.signal })
      if (request.signal.aborted || uid !== owner.current || sequence !== generation.current) return
      if (response.status === 401 || response.status === 403) { changedAccount(); return }
      if (!response.ok) throw new Error()
      const data: NotificationList = await response.json()
      if (request.signal.aborted || uid !== owner.current || sequence !== generation.current) return
      if (data.ownerId !== uid) { changedAccount(); return }
      if (!Array.isArray(data.notifications) || !Number.isInteger(data.unreadCount) || data.unreadCount < 0) throw new Error()
      setSummary({ ownerId: uid, notifications: data.notifications, unreadCount: data.unreadCount, status: 'ready' })
    } catch {
      if (!request.signal.aborted && uid === owner.current && sequence === generation.current) setSummary(previous => ({ ...(previous.ownerId === uid ? previous : empty(uid)), status: 'error' }))
    }
  }, [changedAccount])

  useEffect(() => {
    owner.current = ownerId
    accountEpoch.current++
    generation.current++; controller.current?.abort(); pending.current.clear()
    setSummary(empty(ownerId)); setActions({ ownerId, pending: new Set(), all: false, error: null })
    if (!ownerId) return
    void refresh()
    const onFocus = () => { if (document.visibilityState !== 'hidden') void refresh() }
    const interval = setInterval(onFocus, 60000)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('gh-notifications')
      channel.current.onmessage = event => {
        if (event.data?.type === 'changed' && event.data.ownerId === ownerId) { setChangeVersion(value => value + 1); void refresh() }
      }
    }
    let disposed = false
    let cleanSocket: (() => void) | undefined
    void import('@/lib/socket-client').then(client => {
      if (disposed) return
      const socket = client.getSocket(ownerId)
      const onNotification = () => { void refresh() }
      const onError = () => client.disconnectSocket()
      socket.on('notification', onNotification)
      socket.on('connect_error', onError)
      cleanSocket = () => { socket.off('notification', onNotification); socket.off('connect_error', onError); client.disconnectSocket() }
    }).catch(() => { /* Polling remains available without a custom socket server. */ })
    return () => {
      disposed = true; cleanSocket?.(); clearInterval(interval)
      window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus)
      channel.current?.close(); channel.current = null
      endAccountScope()
    }
  }, [ownerId, refresh, endAccountScope])

  const mutate = useCallback(async (id: string | null, read: boolean) => {
    const uid = owner.current
    const epoch = accountEpoch.current
    const key = id || '__all__'
    if (!uid || pending.current.has(key) || pending.current.has('__all__') || (!id && pending.current.size > 0)) return false
    pending.current.add(key)
    setActions({ ownerId: uid, pending: new Set(pending.current), all: !id, error: null })
    try {
      const response = await fetch(id ? `/api/notifications/${encodeURIComponent(id)}/read` : '/api/notifications', {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(id ? { ownerId: uid, read } : { ownerId: uid, action: 'readAll' }),
      })
      const data = await response.json().catch(() => ({}))
      if (uid !== owner.current || epoch !== accountEpoch.current) return false
      if (response.status === 401 || response.status === 403 || data.code === 'SESSION_CHANGED') { changedAccount(); return false }
      if (!response.ok) throw new Error(data.error || 'The read state could not be saved. Please try again.')
      if (data.ownerId !== uid) { changedAccount(); return false }
      await refresh()
      if (uid !== owner.current || epoch !== accountEpoch.current) return false
      setChangeVersion(value => value + 1)
      channel.current?.postMessage({ type: 'changed', ownerId: uid })
      return true
    } catch (error) {
      if (uid === owner.current && epoch === accountEpoch.current) setActions(previous => ({ ...previous, error: error instanceof Error ? error.message : 'The read state could not be saved. Please try again.' }))
      return false
    } finally {
      if (uid === owner.current && epoch === accountEpoch.current) {
        pending.current.delete(key)
        setActions(previous => ({ ...previous, pending: new Set(pending.current), all: pending.current.has('__all__') }))
      }
    }
  }, [changedAccount, refresh])
  const markRead = useCallback((id: string, read: boolean) => mutate(id, read), [mutate])
  const markAllRead = useCallback(() => mutate(null, true), [mutate])
  // Hide the prior account's data in the render that precedes effect cleanup as well.
  const current = summary.ownerId === ownerId ? summary : empty(ownerId)
  const currentActions = actions.ownerId === ownerId ? actions : { pending: new Set<string>(), all: false, error: null }
  return <Context.Provider value={{ ...current, ownerId, sessionLoading: sessionStatus === 'loading', pendingIds: currentActions.pending, markingAll: currentActions.all, actionError: currentActions.error, changeVersion, refresh, markRead, markAllRead }}>{children}</Context.Provider>
}

export function useNotifications() {
  const context = useContext(Context)
  if (!context) throw new Error('Notifications require NotificationProvider')
  return context
}
