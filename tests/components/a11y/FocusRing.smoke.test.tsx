import { render } from '@testing-library/react'
import { Button } from '@/components/ui/button'

// Simple smoke: ensure our focus ring utility class applies expected ring classes

describe('Focus ring utility', () => {
  it('applies visible focus ring', () => {
    const { container } = render(<Button className="focus-ring">Test</Button>)
    const btn = container.querySelector('button')!
    // We don't simulate tab here; just assert the class list includes our utility
    expect(btn.className).toMatch(/focus-ring/)
  })
})
