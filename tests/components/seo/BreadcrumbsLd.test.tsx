import { render } from '@testing-library/react'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'

describe('BreadcrumbsLd', () => {
  const OLD = process.env.NEXT_PUBLIC_SITE_URL
  beforeAll(() => { process.env.NEXT_PUBLIC_SITE_URL = 'https://example.com' })
  afterAll(() => { process.env.NEXT_PUBLIC_SITE_URL = OLD })

  it('emits BreadcrumbList with absolute URLs and positions', () => {
    const crumbs = [
      { name: 'Home', href: '/' },
      { name: 'Store', href: '/store' },
      { name: 'Copper Bottle', href: '/store/copper-bottle' },
    ]
    const { container } = render(<BreadcrumbsLd crumbs={crumbs} />)
    const script = container.querySelector('script[type="application/ld+json"]') as HTMLScriptElement
    expect(script).toBeTruthy()
    const json = JSON.parse(script.innerHTML)
    expect(json['@type']).toBe('BreadcrumbList')
    expect(json.itemListElement.length).toBe(3)
    expect(json.itemListElement[0].position).toBe(1)
    expect(json.itemListElement[2].position).toBe(3)
    expect(json.itemListElement[2].item).toBe('https://example.com/store/copper-bottle')
  })
})
