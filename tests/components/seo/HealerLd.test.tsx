import { render } from '@testing-library/react'
import HealerLd from '@/components/seo/HealerLd'

describe('HealerLd', () => {
  it('renders schema.org Person JSON-LD with name and languages', () => {
    const { container } = render(<HealerLd healer={{ slug: 'anita', name: 'Anita Sharma', title: 'Yoga Therapist', shortBio: 'Certified practitioner', languages: ['English','Hindi'] }} />)
    const script = container.querySelector('script[type="application/ld+json"]') as HTMLScriptElement
    const json = JSON.parse(script.innerHTML)
    expect(json['@type']).toBe('Person')
    expect(json.name).toBe('Anita Sharma')
    expect(json.url).toContain('/healers/anita')
    expect(json.knowsLanguage).toEqual(['English','Hindi'])
  })
})
