import { render } from '@testing-library/react'
import { axe } from 'jest-axe'
import EmptyState from '@/components/empty/EmptyState'

describe('EmptyState a11y', () => {
  it('is announced politely and passes axe', async () => {
    const { container } = render(
      <EmptyState title="No items found" subtitle="Try adjusting your filters" />
    )
    expect(container.querySelector('[role="status"]')).toBeTruthy()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
