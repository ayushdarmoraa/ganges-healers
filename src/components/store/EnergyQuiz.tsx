'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { trackQuizStart } from '@/lib/analytics/meta-pixel'

const QUESTIONS = [
  {
    id: 'intention',
    title: 'What are you seeking right now?',
    subtitle: 'Choose the intention closest to your heart.',
    options: [
      { value: 'emotional-healing', label: 'Emotional Healing', icon: '💚' },
      { value: 'stress-relief', label: 'Stress Relief', icon: '🧘' },
      { value: 'spiritual-growth', label: 'Spiritual Growth', icon: '✨' },
      { value: 'protection', label: 'Protection', icon: '🛡️' },
      { value: 'prosperity', label: 'Prosperity', icon: '🌟' },
    ],
  },
  {
    id: 'practice',
    title: 'What practice resonates with you?',
    subtitle: 'Select what draws your energy most.',
    options: [
      { value: 'meditation', label: 'Meditation', icon: '🧘‍♀️' },
      { value: 'energy-healing', label: 'Energy Healing', icon: '🔮' },
      { value: 'rituals', label: 'Rituals', icon: '🕯️' },
      { value: 'sound-healing', label: 'Sound Healing', icon: '🔔' },
    ],
  },
  {
    id: 'chakra',
    title: 'Which chakra feels blocked?',
    subtitle: 'Trust your intuition — choose what feels right.',
    options: [
      { value: 'Root', label: 'Root', icon: '🔴' },
      { value: 'Sacral', label: 'Sacral', icon: '🟠' },
      { value: 'Solar Plexus', label: 'Solar Plexus', icon: '🟡' },
      { value: 'Heart', label: 'Heart', icon: '💚' },
      { value: 'Throat', label: 'Throat', icon: '🔵' },
      { value: 'Third Eye', label: 'Third Eye', icon: '🟣' },
      { value: 'Crown', label: 'Crown', icon: '⚪' },
      { value: 'not-sure', label: 'Not Sure', icon: '🤍' },
    ],
  },
] as const

type Answers = Record<string, string>

export default function EnergyQuiz() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Answers>({})

  const question = QUESTIONS[step]
  const selected = answers[question.id] ?? ''
  const isLast = step === QUESTIONS.length - 1
  const canProceed = selected !== ''

  // Fire QuizStart pixel event once on mount
  useEffect(() => { trackQuizStart() }, [])

  function select(value: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }))
  }

  function next() {
    if (!canProceed) return
    if (isLast) {
      const params = new URLSearchParams(answers)
      router.push(`/store/quiz/results?${params.toString()}`)
    } else {
      setStep((s) => s + 1)
    }
  }

  function back() {
    setStep((s) => Math.max(0, s - 1))
  }

  return (
    <div className="max-w-xl mx-auto">
      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= step ? 'bg-amber-500' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Step counter */}
      <p className="text-sm text-muted-foreground mb-2">
        Step {step + 1} of {QUESTIONS.length}
      </p>

      {/* Question */}
      <h2 className="text-2xl font-semibold mb-1">{question.title}</h2>
      <p className="text-muted-foreground mb-6">{question.subtitle}</p>

      {/* Options */}
      <div className="grid gap-3">
        {question.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => select(opt.value)}
            className={`flex items-center gap-3 w-full text-left rounded-xl border-2 px-5 py-4 transition-all ${
              selected === opt.value
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 shadow-sm'
                : 'border-muted hover:border-muted-foreground/40'
            }`}
          >
            <span className="text-2xl">{opt.icon}</span>
            <span className="font-medium">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <Button variant="ghost" onClick={back} disabled={step === 0}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <Button
          onClick={next}
          disabled={!canProceed}
          className="bg-amber-600 hover:bg-amber-700 text-white"
        >
          {isLast ? (
            <>
              <Sparkles className="h-4 w-4 mr-1" />
              See My Results
            </>
          ) : (
            <>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
