import { notFound } from 'next/navigation'
import { getProductBySlug } from '@/lib/store/queries'
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Link from 'next/link'
import ProductCtaAnalytics from '@/app/store/[slug]/product-cta-analytics'
import AddToCartButton from '@/components/store/AddToCartButton'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeProductCrumbs } from '@/lib/seo/breadcrumbs'
import ProductImageGallery from '@/components/store/ProductImageGallery'
import ProductViewTracker from '@/components/store/ProductViewTracker'
import { getVariant } from '@/lib/experiments/ab-testing'
import { listBundles } from '@/lib/store/bundle-queries'
import { getDynamicBundle } from '@/lib/store/dynamic-bundle'
import { getSessionId } from '@/lib/analytics/session'
import { auth } from '@/lib/auth'
import BundleCard from '@/components/store/BundleCard'
import DynamicBundleBanner from '@/components/store/DynamicBundleBanner'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getProductBySlug(slug)
  if (!p) return {}
  return {
    title: `${p.title} | Store | Ganges Healers`,
    description: p.shortDescription,
    alternates: { canonical: canonicalOf(`/store/${p.slug}`) },
    openGraph: { title: p.title, description: p.shortDescription, url: canonicalOf(`/store/${p.slug}`) },
    twitter: { card: 'summary_large_image', title: p.title, description: p.shortDescription },
  }
}

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ source?: string }> }) {
  const { slug } = await params
  const { source } = await searchParams
  const isRecommended = source === 'whatsapp' || source === 'quiz'
  const variant = await getVariant('product_headline')
  const p = await getProductBySlug(slug)
  if (!p) return notFound()
  const crumbs = makeProductCrumbs(slug, p.title)
  const bundles = p.chakra ? await listBundles(p.chakra) : []

  // Smart bundle: behavior-based recommendation with dynamic discount
  const [sessionId, session] = await Promise.all([getSessionId(), auth().catch(() => null)])
  const dynamicBundle = await getDynamicBundle({
    sessionId,
    userId: session?.user?.id ?? null,
    chakra: p.chakra,
  })

  return (
    <div className="container mx-auto p-6" data-variant={variant}>
      <ProductViewTracker productId={p.id} title={p.title} pricePaise={p.pricePaise} chakra={p.chakra} source={source} headlineVariant={variant} />
      <Breadcrumbs crumbs={crumbs} />
      <BreadcrumbsLd crumbs={crumbs} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <ProductImageGallery
            mainImage={p.imageUrl}
            gallery={Array.isArray(p.gallery) ? p.gallery : []}
            title={p.title}
          />
        </div>
        <div>
          {isRecommended ? (
            <div className="mb-2">
              <span className="inline-block bg-purple-600 text-white text-sm font-semibold px-3 py-1 rounded-full">
                🔮 Recommended for Your Energy
              </span>
            </div>
          ) : null}
          {p.isConsecrated ? (
            <div className="mb-2">
              <span className="inline-block bg-amber-900/85 text-amber-100 text-sm font-semibold px-3 py-1 rounded-full">
                ✨ Consecrated Sacred Tool
              </span>
            </div>
          ) : null}
          <h1 className="text-3xl font-semibold">{p.title}</h1>
          {variant === 'B' && p.chakra ? (
            <p className="mt-1 text-sm text-purple-600 dark:text-purple-400 font-medium">
              Aligned with your {p.chakra} Chakra energy
            </p>
          ) : null}
          <div className="mt-1 text-sm text-muted-foreground">{p.category ? p.category.title : 'Uncategorized'}</div>
          <div className="mt-3 text-xl">₹{(p.pricePaise / 100).toFixed(2)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{p.ratingAvg ? `★ ${p.ratingAvg.toFixed(1)}` : 'No ratings'}</div>
          {p.isConsecrated ? (
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-400 italic">
              This consecrated tool is prepared in limited batches
            </p>
          ) : null}
          <div className="mt-2">
            {p.stockStatus === 'OUT' ? (
              <span className="text-red-600">Out of stock</span>
            ) : p.stockCount !== null && p.stockCount <= 5 ? (
              <span className="text-amber-600 font-medium">Only {p.stockCount} left — selling fast</span>
            ) : p.stockStatus === 'LOW' ? (
              <span className="text-amber-600">Low stock</span>
            ) : (
              <>
                <span className="text-green-600">In stock</span>
                <span className="ml-2 text-sm text-amber-600">· Only a few pieces available</span>
              </>
            )}
          </div>
          <AddToCartButton
            productId={p.id}
            slug={p.slug}
            title={p.title}
            pricePaise={p.pricePaise}
            imageUrl={p.imageUrl}
            stockStatus={p.stockStatus}
          />
          {p.service ? (
            <div className="mt-4 space-y-2">
              <ProductCtaAnalytics productSlug={p.slug} serviceSlug={p.service.slug} href={`/services/${p.service.slug}?openBooking=1&productSlug=${encodeURIComponent(p.slug)}`}>
                Book a session for this product
              </ProductCtaAnalytics>
              <div>
                <Link className="text-primary underline" href={`/services/${p.service.slug}?openBooking=1`}>View related service</Link>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="prose mt-6 whitespace-pre-wrap">{p.longDescription}</div>

      {/* Spiritual sections */}
      {(p.chakra || p.spiritualBenefits?.length || p.ritualUse?.length || p.consecrationStory) ? (
        <div className="mt-8 space-y-6">
          {p.chakra ? (
            <section>
              <h2 className="text-lg font-semibold flex items-center gap-2">🔮 Energy Alignment</h2>
              <p className="mt-1 text-purple-600 dark:text-purple-400 font-medium">{p.chakra} Chakra</p>
            </section>
          ) : null}

          {p.spiritualBenefits && p.spiritualBenefits.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold">🙏 Spiritual Benefits</h2>
              <ul className="mt-2 space-y-1">
                {p.spiritualBenefits.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {p.ritualUse && p.ritualUse.length > 0 ? (
            <section>
              <h2 className="text-lg font-semibold">🕯️ Ritual Use</h2>
              <ul className="mt-2 space-y-1">
                {p.ritualUse.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {p.consecrationStory ? (
            <section className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h2 className="text-lg font-semibold">✨ Consecration</h2>
              <p className="mt-2 text-sm leading-relaxed">{p.consecrationStory}</p>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* Smart Bundle (behavior-based) */}
      {dynamicBundle.bundle && (
        <div className="mt-8">
          <DynamicBundleBanner
            bundle={dynamicBundle.bundle}
            discountPct={dynamicBundle.discountPct}
            reason={dynamicBundle.reason}
          />
        </div>
      )}

      {/* Recommended Bundles */}
      {bundles.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-xl font-semibold">🎁 Recommended Bundles</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bundles.map((b) => (
              <BundleCard key={b.id} bundle={b} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
