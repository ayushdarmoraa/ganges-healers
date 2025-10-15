import { render } from '@testing-library/react'
import ProgramLd from '@/components/seo/ProgramLd'

describe('ProgramLd', () => {
  it('renders schema.org Course with price and timeRequired', () => {
    const { container } = render(<ProgramLd program={{ slug: 'foundations', title: 'Yoga Foundations', shortDescription: 'Intro course', pricePaise: 150000, sessionsCount: 6, service: null }} />)
    const script = container.querySelector('script[type="application/ld+json"]') as HTMLScriptElement
    const json = JSON.parse(script.innerHTML)
    expect(json['@type']).toBe('Course')
    expect(json.url).toContain('/programs/foundations')
    expect(json.offers.price).toBe('1500.00')
    expect(json.timeRequired).toContain('6')
  })
})
