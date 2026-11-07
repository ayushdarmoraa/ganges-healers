import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Sacred Consecration Process | Ganges Healers',
  description:
    'Learn how every sacred tool in our store is energetically cleansed, blessed through meditation, harmonized with sound vibration, and packed with protective intention before it reaches you.',
  alternates: { canonical: canonicalOf('/consecration') },
}

const STEPS = [
  {
    icon: '🌊',
    title: 'Energy Cleansing',
    description:
      'Each sacred tool undergoes a thorough energetic purification process. Stagnant or residual energies accumulated during production and handling are carefully cleared using traditional cleansing methods — including smoke purification with sage, salt water immersion for crystals, and moonlight exposure — ensuring every item arrives in a pure energetic state.',
  },
  {
    icon: '🧘',
    title: 'Sacred Intention Meditation',
    description:
      'After cleansing, each tool is held in a dedicated meditative space where healing intention is invoked. Our practitioners enter a deep meditative state and channel focused energy into the object, aligning it with its highest healing purpose. This step imbues the tool with conscious intention for the well-being of its future owner.',
  },
  {
    icon: '🔔',
    title: 'Sound Vibration Alignment',
    description:
      'Sound frequencies from Tibetan singing bowls, crystal bowls, and sacred mantras are used to harmonize and stabilize the energetic structure of each tool. These vibrations penetrate the molecular structure of the material, creating a coherent energy field that supports meditation, healing, and spiritual practice.',
  },
  {
    icon: '🛡️',
    title: 'Protective Packaging',
    description:
      'Every consecrated item is wrapped and packed with deliberate care and protective intention. We use natural materials wherever possible and include a brief blessing card with each order. From our hands to yours, the sacred energy is preserved throughout the journey.',
  },
] as const

export default function ConsecrationPage() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      {/* Hero */}
      <section className="text-center space-y-4 mb-12">
        <h1 className="text-4xl font-bold tracking-tight">Sacred Consecration Process</h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mx-auto">
          Every product in our store is more than an object — it is a carefully prepared sacred tool.
          Before reaching you, each item passes through a multi-step consecration process designed to
          cleanse, energize, and align it with healing intention.
        </p>
      </section>

      {/* Steps */}
      <div className="space-y-10">
        {STEPS.map((step, i) => (
          <section key={step.title} className="flex gap-4">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-2xl">
              {step.icon}
            </div>
            <div>
              <h2 className="text-xl font-semibold">
                <span className="text-muted-foreground mr-2">{i + 1}.</span>
                {step.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{step.description}</p>
            </div>
          </section>
        ))}
      </div>

      {/* CTA */}
      <section className="mt-14 text-center space-y-3">
        <p className="text-muted-foreground text-sm">
          Ready to explore our consecrated sacred tools?
        </p>
        <Link href="/store">
          <Button size="lg">Browse the Sacred Store</Button>
        </Link>
      </section>
    </div>
  )
}
