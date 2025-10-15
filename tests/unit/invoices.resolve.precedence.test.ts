import { resolveInvoiceUrl } from '@/lib/invoices/resolve'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(async () => []),
    payment: { findFirst: jest.fn(async () => null) },
    invoice: { findFirst: jest.fn(async () => null) },
  }
}))

const { prisma } = jest.requireMock('@/lib/prisma') as unknown as { prisma: { $queryRaw: jest.Mock; payment: { findFirst: jest.Mock }; invoice: { findFirst: jest.Mock } } }

describe('resolveInvoiceUrl precedence', () => {
  const ID = 'INV-1001'

  beforeEach(() => {
    jest.resetAllMocks()
  })

  test('Payment.invoiceUrl legacy fast path wins', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ invoiceUrl: 'https://blob.example.com/legacy.pdf' }])
    const url = await resolveInvoiceUrl(ID)
    expect(url).toBe('https://blob.example.com/legacy.pdf')
    expect(prisma.payment.findFirst).not.toHaveBeenCalled()
    expect(prisma.invoice.findFirst).not.toHaveBeenCalled()
  })

  test('falls back to Payment.invoice.pdfUrl relation when no legacy URL', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([])
    prisma.payment.findFirst.mockResolvedValueOnce({ invoice: { pdfUrl: 'https://blob.example.com/relation.pdf' } })
    const url = await resolveInvoiceUrl(ID)
    expect(url).toBe('https://blob.example.com/relation.pdf')
    expect(prisma.invoice.findFirst).not.toHaveBeenCalled()
  })

  test('falls back to Invoice.pdfUrl by invoiceNumber or id when no payment match', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([])
    prisma.payment.findFirst.mockResolvedValueOnce(null)
    prisma.invoice.findFirst.mockResolvedValueOnce({ pdfUrl: 'https://blob.example.com/direct.pdf' })
    const url = await resolveInvoiceUrl('INV-999')
    expect(url).toBe('https://blob.example.com/direct.pdf')
  })

  test('returns null when nothing matches', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([])
    prisma.payment.findFirst.mockResolvedValueOnce(null)
    prisma.invoice.findFirst.mockResolvedValueOnce(null)
    const url = await resolveInvoiceUrl('UNKNOWN')
    expect(url).toBeNull()
  })
})
