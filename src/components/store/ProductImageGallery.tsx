'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  mainImage: string | null
  gallery: string[]
  title: string
}

export default function ProductImageGallery({ mainImage, gallery, title }: Props) {
  const allImages = mainImage
    ? [mainImage, ...gallery.filter((g) => g !== mainImage)]
    : gallery

  const [selected, setSelected] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const currentSrc = allImages[selected] ?? null

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setSelected((prev) => (prev + dir + allImages.length) % allImages.length)
    },
    [allImages.length],
  )

  if (!currentSrc && allImages.length === 0) {
    return <div className="w-full aspect-[3/2] bg-muted rounded-lg" />
  }

  return (
    <>
      {/* Main image */}
      <div
        className="relative w-full aspect-[3/2] rounded-lg overflow-hidden bg-muted cursor-zoom-in"
        onClick={() => setLightboxOpen(true)}
      >
        {currentSrc && (
          <Image
            src={currentSrc}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
            priority
          />
        )}
      </div>

      {/* Thumbnail strip */}
      {allImages.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {allImages.map((src, i) => (
            <button
              key={src}
              type="button"
              onClick={() => setSelected(i)}
              className={`relative w-20 h-20 flex-shrink-0 rounded-md overflow-hidden border-2 transition-colors ${
                i === selected
                  ? 'border-amber-500 ring-1 ring-amber-500/50'
                  : 'border-transparent hover:border-muted-foreground/40'
              }`}
            >
              <Image
                src={src}
                alt={`${title} ${i + 1}`}
                fill
                className="object-cover"
                sizes="80px"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      )}

      {/* Fullscreen lightbox */}
      {lightboxOpen && currentSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close button */}
          <button
            type="button"
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-7 w-7" />
          </button>

          {/* Navigation arrows */}
          {allImages.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10"
                onClick={(e) => { e.stopPropagation(); navigate(-1) }}
              >
                <ChevronLeft className="h-10 w-10" />
              </button>
              <button
                type="button"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white z-10"
                onClick={(e) => { e.stopPropagation(); navigate(1) }}
              >
                <ChevronRight className="h-10 w-10" />
              </button>
            </>
          )}

          {/* Lightbox image */}
          <div
            className="relative w-[90vw] h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={currentSrc}
              alt={title}
              fill
              className="object-contain"
              sizes="90vw"
              priority
            />
          </div>

          {/* Image counter */}
          {allImages.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/70 text-sm">
              {selected + 1} / {allImages.length}
            </div>
          )}
        </div>
      )}
    </>
  )
}
