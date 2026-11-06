'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export type ProductDeleteResult = { success: true } | { success: false; error: string; code?: string }
interface Props {
  id: string; title: string; version: string; ownerId: string; protectedHistory: boolean
  action: (data: FormData) => Promise<ProductDeleteResult>
}

/** A confirmation belongs to the currently signed-in administrator and saved product version. */
export function DeleteProductForm(props: Props) {
  const { data, status } = useSession()
  if (status !== 'authenticated' || data?.user?.id !== props.ownerId || data.user.role !== 'ADMIN') return null
  return <DeleteProductControl key={`${props.ownerId}:${props.id}:${props.version}`} {...props} />
}
function DeleteProductControl({ id, title, version, protectedHistory, action }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(''), [deleted, setDeleted] = useState(false)
  const alive = useRef(true), busy = useRef(false)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  async function remove() {
    if (busy.current || protectedHistory) return
    busy.current = true; setPending(true); setError('')
    const body = new FormData(); body.set('id', id); body.set('version', version)
    try {
      const result = await action(body)
      if (!alive.current) return
      if (result?.success === true) { setDeleted(true); setOpen(false) }
      else setError(result?.success === false && typeof result.error === 'string' ? result.error : 'Deletion could not be confirmed. Reload the product list before trying again.')
    } catch { if (alive.current) setError('The product could not be deleted. Please try again.') }
    finally { busy.current = false; if (alive.current) setPending(false) }
  }
  if (deleted) return <p role="status" className="text-sm">Product deleted.</p>
  return <div className="max-w-xs space-y-2">
    <Button ref={trigger} type="button" variant="destructive" size="sm" disabled={protectedHistory} onClick={() => { setError(''); setOpen(true) }}>Delete</Button>
    {protectedHistory && <p className="text-xs text-muted-foreground">Order or bundle history is protected. Use Deactivate to remove this product from sale.</p>}
    <Dialog open={open} onOpenChange={value => { if (!busy.current) setOpen(value) }}>
      <DialogContent showCloseButton={!pending} onCloseAutoFocus={event => { event.preventDefault(); if (alive.current) trigger.current?.focus() }} onEscapeKeyDown={event => { if (busy.current) event.preventDefault() }} onInteractOutside={event => { if (busy.current) event.preventDefault() }}>
        <DialogHeader><DialogTitle>Delete product permanently?</DialogTitle><DialogDescription>Delete “{title}”? This cannot be undone. Products with order or bundle records are kept.</DialogDescription></DialogHeader>
        {error && <div className="space-y-2"><p role="alert" className="text-sm text-destructive">{error}</p><Button type="button" variant="outline" onClick={() => { setOpen(false); router.refresh() }}>Reload product list</Button></div>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Keep product</Button><Button type="button" variant="destructive" disabled={pending} onClick={() => void remove()}>{pending ? 'Deleting…' : 'Delete product permanently'}</Button></div>
      </DialogContent>
    </Dialog>
  </div>
}
