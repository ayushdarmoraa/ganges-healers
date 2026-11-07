import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import EnergyQuiz from '@/components/store/EnergyQuiz'

export const metadata: Metadata = {
  title: 'Energy Quiz — Discover Your Sacred Tools | Ganges Healers',
  description:
    'Answer 3 simple questions to discover which sacred healing tools are aligned with your energy. Personalized spiritual product recommendations.',
  alternates: { canonical: canonicalOf('/store/quiz') },
}

export default function QuizPage() {
  return (
    <div className="container mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-10">
        <span className="text-4xl mb-3 block">🔮</span>
        <h1 className="text-3xl md:text-4xl font-bold">Discover Your Energy Alignment</h1>
        <p className="mt-3 text-muted-foreground max-w-lg mx-auto">
          Answer 3 simple questions and we&apos;ll recommend sacred healing tools aligned with your
          unique energy.
        </p>
      </div>

      {/* Quiz */}
      <EnergyQuiz />
    </div>
  )
}
