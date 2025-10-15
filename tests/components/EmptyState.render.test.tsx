import { render, screen } from '@testing-library/react'
import EmptyState from '@/components/empty/EmptyState'

describe('EmptyState', () => {
  test('renders title, subtitle, and action', () => {
    render(<EmptyState title="No items" subtitle="Try later" action={<button>Act</button>} />)
    expect(screen.getByText('No items')).toBeInTheDocument()
    expect(screen.getByText('Try later')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument()
  })
})
