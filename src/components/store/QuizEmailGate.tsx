'use client'

import { useState, type FormEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { trackLead, trackQuizComplete } from '@/lib/analytics/meta-pixel'

interface Product {
  id: string
  slug: string
  title: string
  shortDescription: string | null
  pricePaise: number
  imageUrl: string | null
  chakra: string | null
  isConsecrated: boolean
}

interface QuizEmailGateProps {
  intention: string
  practice: string
  chakra: string
  intentionLabel: string
  practiceLabel: string
  chakraLabel: string
  products: Product[]
}

export function QuizEmailGate({
  intention,
  practice,
  chakra,
  intentionLabel,
  practiceLabel,
  chakraLabel,
  products,
}: QuizEmailGateProps) {
  const [revealed, setRevealed] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const primary = products[0] ?? null
  const others = products.slice(1)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/store/quiz-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, phone: phone.trim() || undefined, intention, practice, chakra }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Something went wrong. Please try again.')
        return
      }

      setRevealed(true)
      // Fire pixel events: Lead (email captured) + QuizComplete
      trackLead({ content_name: intention })
      trackQuizComplete({ intention, practice, chakra })
      // Persist quiz context for downstream attribution
      try {
        localStorage.setItem('ganges-quiz', JSON.stringify({ intention, practice, chakra }))
      } catch {}
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-12">
      {/* Energy Profile - Always Visible */}
      <div className="max-w-2xl mx-auto text-center">
        <span className="text-5xl mb-4 block">✨</span>
        <h1 className="text-3xl md:text-4xl font-bold">Your Energy Alignment</h1>
        <p className="mt-3 text-muted-foreground">
          Based on your responses, here is your spiritual energy profile.
        </p>

        <div className="mt-8 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 p-6 space-y-4 text-left">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Intention</span>
            <span className="font-medium">{intentionLabel}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Practice</span>
            <span className="font-medium">{practiceLabel}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Chakra Focus</span>
            <span className="font-medium text-purple-600 dark:text-purple-400">{chakraLabel}</span>
          </div>
        </div>
      </div>

      {/* Email Gate OR Revealed Results */}
      {!revealed ? (
        <div className="mt-12 max-w-lg mx-auto">
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-card p-8 text-center shadow-lg">
            <span className="text-4xl mb-3 block">🔮</span>
            <h2 className="text-2xl font-bold">
              Your Personalized Sacred Tools Are Ready
            </h2>
            <p className="text-muted-foreground mt-2">
              Enter your email to unlock your personalized recommendations and receive
              exclusive spiritual guidance.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-3 text-left">
              <div>
                <label htmlFor="lead-name" className="block text-sm font-medium mb-1">
                  Name <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="lead-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="lead-email" className="block text-sm font-medium mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="lead-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="lead-phone" className="block text-sm font-medium mb-1">
                  Get your recommendation instantly on WhatsApp ✨{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </label>
                <input
                  id="lead-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white py-3 rounded-lg font-medium transition-colors"
              >
                {submitting ? 'Unlocking...' : 'Unlock My Recommendations ✨'}
              </button>

              <p className="text-xs text-muted-foreground text-center mt-2">
                We respect your privacy. No spam, unsubscribe anytime.
              </p>
            </form>
          </div>

          {/* Blurred preview teaser */}
          {primary && (
            <div className="mt-8 relative">
              <div className="blur-md pointer-events-none select-none" aria-hidden="true">
                <div className="rounded-2xl border bg-card overflow-hidden">
                  <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="aspect-square bg-muted" />
                    <div className="p-6">
                      <div className="h-4 w-32 bg-muted rounded mb-2" />
                      <div className="h-6 w-48 bg-muted rounded mb-3" />
                      <div className="h-3 w-full bg-muted rounded mb-1" />
                      <div className="h-3 w-3/4 bg-muted rounded mb-4" />
                      <div className="h-8 w-24 bg-muted rounded" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-amber-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg">
                  🔒 Enter email to reveal
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Primary Recommendation */}
          {primary && (
            <div className="mt-12 max-w-3xl mx-auto">
              <h2 className="text-2xl font-bold text-center mb-6">Your Primary Sacred Tool</h2>
              <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-card overflow-hidden shadow-lg">
                <div className="grid grid-cols-1 md:grid-cols-2">
                  <div className="relative aspect-square bg-muted">
                    {primary.imageUrl ? (
                      <Image
                        src={primary.imageUrl}
                        alt={primary.title}
                        fill
                        className="object-cover"
                        sizes="(max-width: 768px) 100vw, 50vw"
                        priority
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-6xl">🔮</div>
                    )}
                    {primary.isConsecrated && (
                      <span className="absolute top-3 left-3 bg-amber-900/85 text-amber-100 text-sm font-semibold px-3 py-1 rounded-full">
                        ✨ Consecrated Sacred Tool
                      </span>
                    )}
                  </div>
                  <div className="p-6 md:p-8 flex flex-col justify-center">
                    <p className="text-sm text-muted-foreground mb-1">Most aligned with your energy</p>
                    <h3 className="text-2xl font-bold">{primary.title}</h3>
                    {primary.chakra && (
                      <span className="text-sm text-purple-600 dark:text-purple-400 font-medium mt-1">
                        {primary.chakra} Chakra Alignment
                      </span>
                    )}
                    {primary.shortDescription && (
                      <p className="text-muted-foreground mt-3 leading-relaxed">{primary.shortDescription}</p>
                    )}
                    <div className="mt-4 text-2xl font-bold">₹{(primary.pricePaise / 100).toFixed(2)}</div>
                    <Link
                      href={`/store/${primary.slug}`}
                      className="mt-5 inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-lg font-medium transition-colors w-full md:w-auto"
                    >
                      Start with this sacred tool →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Other Recommended Tools */}
          <div className="mt-12 max-w-5xl mx-auto">
            {primary && others.length > 0 ? (
              <>
                <h2 className="text-xl font-bold text-center mb-2">Other Recommended Tools</h2>
                <p className="text-center text-muted-foreground mb-8">
                  {chakra === 'not-sure'
                    ? 'More powerful tools for universal alignment.'
                    : `More sacred tools aligned with your ${chakra} Chakra energy.`}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {others.map((p) => (
                    <Link
                      key={p.id}
                      href={`/store/${p.slug}`}
                      className="group rounded-xl border bg-card overflow-hidden hover:shadow-lg transition-shadow"
                    >
                      <div className="relative aspect-[4/3] bg-muted">
                        {p.imageUrl ? (
                          <Image
                            src={p.imageUrl}
                            alt={p.title}
                            fill
                            className="object-cover group-hover:scale-105 transition-transform duration-300"
                            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-4xl">🔮</div>
                        )}
                        {p.isConsecrated && (
                          <span className="absolute top-2 left-2 bg-amber-900/85 text-amber-100 text-xs font-semibold px-2 py-0.5 rounded-full">
                            ✨ Consecrated
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <h3 className="font-semibold group-hover:text-amber-600 transition-colors">{p.title}</h3>
                        {p.chakra && (
                          <span className="text-xs text-purple-600 dark:text-purple-400">{p.chakra} Chakra</span>
                        )}
                        {p.shortDescription && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{p.shortDescription}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span className="font-semibold">₹{(p.pricePaise / 100).toFixed(2)}</span>
                          <span className="text-sm text-amber-600 font-medium group-hover:underline">
                            View sacred tool →
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            ) : !primary ? (
              <div className="text-center rounded-2xl border-2 border-dashed border-muted-foreground/25 p-10">
                <p className="text-lg text-muted-foreground mb-4">
                  We&apos;re expanding our {chakraLabel} collection. Explore all sacred tools below.
                </p>
                <Link
                  href="/store"
                  className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  Explore All Sacred Tools
                </Link>
              </div>
            ) : null}
          </div>

          {/* Bottom actions */}
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/store/quiz"
              className="inline-flex items-center justify-center gap-2 border border-muted-foreground/25 px-6 py-3 rounded-lg font-medium hover:bg-muted transition-colors"
            >
              Retake Quiz
            </Link>
            <Link
              href="/store"
              className="inline-flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
            >
              Browse Sacred Store
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
