'use client'

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type SaveResult = { error?: string; reloadRequired?: boolean }

export function CatalogEditor({ action, children, item, create = false, submitLabel, compact = false }: {
  action: (data: FormData) => Promise<SaveResult>
  children: ReactNode
  item: string
  create?: boolean
  submitLabel?: string
  compact?: boolean
}) {
  const [result, setResult] = useState<SaveResult | null>(null)
  const [pending, startTransition] = useTransition()
  const saving = useRef(false)
  // Preserve native server-action submission before the editor hydrates.
  const formAction: (data: FormData) => void = action

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving.current) return

    const form = event.currentTarget
    const data = new FormData(form)
    saving.current = true
    setResult(null)
    startTransition(async () => {
      try {
        const response = await action(data)
        if (!response.error && create) form.reset()
        setResult(response)
      } catch {
        setResult({ error: `The ${item.toLowerCase()} could not be saved. Try again.` })
      } finally {
        saving.current = false
      }
    })
  }

  return (
    <form action={formAction} onSubmit={submit}>
      <fieldset disabled={pending} className={compact ? 'flex flex-wrap items-center gap-2' : 'mt-2 grid grid-cols-1 gap-3 md:grid-cols-3'}>
        {children}
        {result?.error && <p role="alert" className="text-sm text-destructive md:col-span-3">{result.error}</p>}
        {result?.reloadRequired && <div className="md:col-span-3"><Button type="button" variant="outline" onClick={() => window.location.reload()}>Discard drafts and reload</Button></div>}
        {result && !result.error && <p role="status" className="text-sm md:col-span-3">{item} {create ? 'created.' : 'saved.'}</p>}
        <div>
          <Button type="submit" size="sm">{pending ? 'Saving…' : submitLabel ?? (create ? 'Create' : 'Save')}</Button>
        </div>
      </fieldset>
    </form>
  )
}
