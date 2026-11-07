import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { QuizEmailGate } from '@/components/store/QuizEmailGate'

export const metadata: Metadata = {
  title: 'Your Energy Alignment Results | Ganges Healers',
  description: 'Personalized sacred tool recommendations based on your energy profile.',
  alternates: { canonical: canonicalOf('/store/quiz/results') },
}

interface Props {
  searchParams: Promise<{ intention?: string; practice?: string; chakra?: string }>
}

async function getRecommendedProducts(chakra: string) {
  const isNotSure = chakra === 'not-sure'

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      ...(isNotSure ? {} : { chakra }),
    },
    orderBy: [
      { isConsecrated: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 6,
    select: {
      id: true,
      slug: true,
      title: true,
      shortDescription: true,
      pricePaise: true,
      imageUrl: true,
      chakra: true,
      isConsecrated: true,
    },
  })

  return products
}

export default async function QuizResultsPage({ searchParams }: Props) {
  const { intention, practice, chakra } = await searchParams

  if (!intention || !practice || !chakra) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold mb-4">No quiz answers found</h1>
        <p className="text-muted-foreground mb-6">
          Please take the energy quiz first so we can align your sacred tools.
        </p>
        <Link
          href="/store/quiz"
          className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          🔮 Take the Energy Quiz
        </Link>
      </div>
    )
  }

  const intentionLabel = intention.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const practiceLabel = practice.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  const chakraLabel = chakra === 'not-sure' ? 'Open Alignment' : `${chakra} Chakra`

  const products = await getRecommendedProducts(chakra)

  return (
    <QuizEmailGate
      intention={intention}
      practice={practice}
      chakra={chakra}
      intentionLabel={intentionLabel}
      practiceLabel={practiceLabel}
      chakraLabel={chakraLabel}
      products={products}
    />
  )
}
