'use client'

import { useId, useState, type FormEvent } from 'react'
import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type BookingReview = { id: string; rating: number; comment: string | null }

function isSavedReview(value: unknown): value is BookingReview {
  return Boolean(value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id
    && 'rating' in value && typeof value.rating === 'number' && Number.isInteger(value.rating) && value.rating >= 1 && value.rating <= 5
    && 'comment' in value && (value.comment === null || typeof value.comment === 'string'))
}

export default function BookingReviewForm({ bookingId, serviceName, review, onSaved }: {
  bookingId: string; serviceName: string; review?: BookingReview | null; onSaved: (review: BookingReview) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || rating === null) return
    setPending(true)
    setError('')
    try {
      const response = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/review`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rating, comment: comment.trim() }),
      })
      const body: unknown = await response.json().catch(() => null)
      const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'Could not save your review. Please try again.'
      if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in again before saving your review.' : message)
      if (!body || typeof body !== 'object' || !('data' in body) || !isSavedReview(body.data)) {
        throw new Error('Could not confirm your saved review. Refresh your bookings before trying again.')
      }
      onSaved(body.data)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not save your review. Please try again.')
    } finally { setPending(false) }
  }

  if (review) return (
    <section className="border-t pt-4 space-y-2" aria-label={`Your review of ${serviceName}`}>
      <p className="font-medium text-sm" role="status">Your review · {review.rating} out of 5 stars</p>
      {review.comment ? <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{review.comment}</p> : null}
    </section>
  )
  if (!open) return <div className="border-t pt-3"><Button variant="outline" onClick={() => setOpen(true)}>Write a review</Button></div>
  return (
    <form onSubmit={submit} className="border-t pt-4 space-y-4" aria-label={`Review ${serviceName}`} aria-describedby={`${id}-public`}>
      <div>
        <h3 className="font-medium">How was your session?</h3>
        <p id={`${id}-public`} className="text-sm text-muted-foreground">Your rating and review will appear publicly with your profile name.</p>
      </div>
      <fieldset disabled={pending} className="space-y-2">
        <legend className="text-sm font-medium">Rating (required)</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map(value => (
            <label key={value} className="cursor-pointer">
              <input className="peer sr-only" type="radio" name={`${id}-rating`} value={value} required checked={rating === value} onChange={() => setRating(value)} />
              <span className={`inline-flex items-center gap-1 rounded-md border px-3 py-2 text-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring ${rating === value ? 'border-primary bg-primary/10 text-primary' : 'border-input'}`}>
                <Star aria-hidden="true" className={`size-4 ${rating === value ? 'fill-current' : ''}`} />
                <span>{value}<span className="sr-only"> {value === 1 ? 'star' : 'stars'}</span></span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <label htmlFor={`${id}-comment`} className="text-sm font-medium">Your review (optional)</label>
        <textarea id={`${id}-comment`} className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" rows={4} maxLength={2000} value={comment} disabled={pending} onChange={event => setComment(event.target.value)} />
        <p className="text-xs text-muted-foreground">{comment.length}/2000 characters</p>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || rating === null}>{pending ? 'Saving review…' : 'Submit review'}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => { setOpen(false); setError('') }}>Cancel review</Button>
      </div>
    </form>
  )
}
