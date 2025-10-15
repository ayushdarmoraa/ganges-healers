import { render } from '@testing-library/react'
import ServiceLd from '@/components/seo/ServiceLd'

describe('ServiceLd', () => {
  it('renders schema.org Service JSON-LD with url and offers', () => {
    const { container } = render(<ServiceLd service={{ slug: 'reiki', title: 'Reiki Healing', shortDescription: 'Relaxing energy work', pricePaise: 250000 }} />)
    const script = container.querySelector('script[type="application/ld+json"]') as HTMLScriptElement
    expect(script).not.toBeNull()
    const json = JSON.parse(script.innerHTML)
    expect(json['@type']).toBe('Service')
    expect(json.url).toContain('/services/reiki')
    expect(json.offers.price).toBe('2500.00')
  })
})
