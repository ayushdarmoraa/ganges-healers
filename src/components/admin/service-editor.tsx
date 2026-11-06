'use client'

import { useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type SaveResult = { error?: string }

export function ServiceEditor({ action, children, create = false }: {
  action: (data: FormData) => Promise<SaveResult>
  children: ReactNode
  create?: boolean
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
        setResult({ error: 'The service could not be saved. Try again.' })
      } finally {
        saving.current = false
      }
    })
  }

  return (
    <form action={formAction} onSubmit={submit}>
      <fieldset disabled={pending} className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
        {children}
        {result?.error && <p role="alert" className="text-sm text-destructive md:col-span-3">{result.error}</p>}
        {result && !result.error && <p role="status" className="text-sm md:col-span-3">{create ? 'Service created.' : 'Service saved.'}</p>}
        <div>
          <Button type="submit" size="sm">{pending ? 'Saving…' : create ? 'Create' : 'Save'}</Button>
        </div>
      </fieldset>
    </form>
  )
}
