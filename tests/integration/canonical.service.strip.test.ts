import { generateMetadata } from '@/app/services/[slug]/page'

describe('Service detail metadata canonical', () => {
  it('strips openBooking and programSlug from canonical URL', async () => {
  const md = await generateMetadata({ params: Promise.resolve({ slug: 'reiki' }) })
    // alternates.canonical should not include query even if present in runtime URL; uses canonicalOf
  const alternates = (md as unknown as { alternates?: { canonical?: string } }).alternates
  const canonical = alternates?.canonical
    expect(canonical).toMatch(/\/services\/reiki$/)
    expect(canonical).not.toMatch(/openBooking|programSlug/)
  })
})
