import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import InvoiceActions from '@/components/invoices/InvoiceActions'

jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }))

describe('Dashboard invoices viewer links', () => {
  beforeAll(() => {
    // @ts-expect-error jest env polyfill
    global.navigator.clipboard = { writeText: jest.fn().mockResolvedValue(undefined) }
  })

  it('renders View hrefs and copies absolute URL', async () => {
    render(
      <div>
        <InvoiceActions inv={{ invoiceNumber: 'INV-2002', paymentId: 'pay_x' }} />
        <InvoiceActions inv={{ paymentId: 'pay_999' }} />
      </div>
    )

    const links = screen.getAllByRole('link', { name: 'View' })
    expect(links[0]).toHaveAttribute('href', '/invoices/INV-2002/view')
    expect(links[1]).toHaveAttribute('href', '/invoices/pay_999/view')

    const copyBtns = screen.getAllByRole('button', { name: 'Copy invoice link' })
    fireEvent.click(copyBtns[0])

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      new URL('/invoices/INV-2002/view', window.location.origin).toString()
    )
  })
})
