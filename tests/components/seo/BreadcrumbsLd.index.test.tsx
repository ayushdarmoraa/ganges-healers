import { render } from '@testing-library/react'
import BreadcrumbsLd from '@/components/seo/BreadcrumbsLd'
import { canonicalOf } from '@/config/site'

function extractJson(script: HTMLElement) {
  const jsonText = script.textContent || script.innerHTML
  return JSON.parse(jsonText)
}

describe('BreadcrumbsLd (index)', () => {
  test('emits BreadcrumbList with absolute URLs for index crumbs', () => {
    const crumbs = [
      { name: 'Home', href: '/' },
      { name: 'Store', href: '/store' },
    ]
    const { container } = render(<BreadcrumbsLd crumbs={crumbs} />)
    const script = container.querySelector('script[type="application/ld+json"]') as HTMLScriptElement
    expect(script).toBeTruthy()
    const data = extractJson(script)
    expect(data['@type']).toBe('BreadcrumbList')
    expect(Array.isArray(data.itemListElement)).toBe(true)
    expect(data.itemListElement).toHaveLength(2)
    expect(data.itemListElement[0]).toMatchObject({ position: 1, name: 'Home', item: canonicalOf('/') })
    expect(data.itemListElement[1]).toMatchObject({ position: 2, name: 'Store', item: canonicalOf('/store') })
  })
})
