import { invoiceViewerHref } from '@/lib/invoices/viewer-link'

describe('invoiceViewerHref', () => {
  it('prefers invoiceNumber', () => {
    expect(
      invoiceViewerHref({ invoiceNumber: 'INV-1001', paymentId: 'pay_1', id: 'abc' })
    ).toBe('/invoices/INV-1001/view')
  })

  it('falls back to paymentId', () => {
    expect(invoiceViewerHref({ paymentId: 'pay_1', id: 'abc' })).toBe('/invoices/pay_1/view')
  })

  it('falls back to id', () => {
    expect(invoiceViewerHref({ id: 'abc' })).toBe('/invoices/abc/view')
  })

  it('throws when none present', () => {
    expect(() => invoiceViewerHref({} as unknown as { invoiceNumber?: string | null })).toThrow()
  })
})
