import { notFound } from 'next/navigation'
import { getProductBySlug } from '@/lib/store/queries'
import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import Link from 'next/link'
import ProductCtaAnalytics from '@/app/store/[slug]/product-cta-analytics'
import Breadcrumbs from '@/components/seo/Breadcrumbs'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { makeProductCrumbs } from '@/lib/seo/breadcrumbs'

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

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await getProductBySlug(slug)
  if (!p) return notFound()
  const crumbs = makeProductCrumbs(slug, p.title)
  return (
    <div className="container mx-auto p-6">
      <Breadcrumbs crumbs={crumbs} />
      <BreadcrumbsLd crumbs={crumbs} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          {p.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.imageUrl} alt={p.title} className="w-full rounded" />
          ) : (
            <div className="w-full h-64 bg-muted rounded" />
          )}
          {Array.isArray(p.gallery) && p.gallery.length > 0 ? (
            <div className="mt-3 grid grid-cols-4 gap-2">
              {p.gallery.map((g, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={g} alt={`${p.title} ${i+1}`} className="w-full h-20 object-cover rounded" />
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <h1 className="text-3xl font-semibold">{p.title}</h1>
          <div className="mt-1 text-sm text-muted-foreground">{p.category ? p.category.title : 'Uncategorized'}</div>
          <div className="mt-3 text-xl">₹{(p.pricePaise / 100).toFixed(2)}</div>
          <div className="mt-1 text-sm text-muted-foreground">{p.ratingAvg ? `★ ${p.ratingAvg.toFixed(1)}` : 'No ratings'}</div>
          <div className="mt-2">
            {p.stockStatus === 'OUT' ? (
              <span className="text-red-600">Out of stock</span>
            ) : p.stockStatus === 'LOW' ? (
              <span className="text-amber-600">Low stock</span>
            ) : (
              <span className="text-green-600">In stock</span>
            )}
          </div>
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
    </div>
  )
}
