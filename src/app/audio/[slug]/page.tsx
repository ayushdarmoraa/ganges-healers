import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import AudioPlayerClient from '@/components/audio/AudioPlayerClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const track = await prisma.audioTrack.findFirst({
    where: { isPublished: true, OR: [{ id: slug }, { slug }] },
    select: { title: true, description: true, category: true },
  })
  if (!track) return { title: 'Track Not Found' }
  return {
    title: `${track.title} | Audio Library | Ganges Healers`,
    description: track.description?.slice(0, 160) || `Listen to ${track.title} — ${track.category}`,
  }
}

export default async function AudioTrackPage({ params }: Props) {
  const { slug } = await params

  const track = await prisma.audioTrack.findFirst({
    where: { isPublished: true, OR: [{ id: slug }, { slug }] },
    select: { slug: true },
  })

  if (!track) notFound()

  return <AudioPlayerClient slug={track.slug} />
}
