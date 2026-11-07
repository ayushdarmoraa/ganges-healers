import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { createAndStoreInvoicePdf } from '@/lib/invoices'
import { put } from '@vercel/blob'

jest.mock('@vercel/blob', () => ({ put: jest.fn(async () => ({ url: 'https://example.com/test-membership-invoice.pdf' })) }))

test('membership invoice works on the current schema without a legacy invoiceUrl column', async () => {
  const user = await prisma.user.create({ data: { email: `invoice_${randomUUID()}@example.com`, name: 'Test Customer' } })
  const gatewayPaymentId = `pay_${randomUUID()}`
  const payment = await prisma.payment.create({ data: { userId: user.id, type: 'MEMBERSHIP', gateway: 'razorpay', status: 'success', statusEnum: 'SUCCESS', amountPaise: 19900, currency: 'INR', gatewayPaymentId } })
  try {
    const url = await createAndStoreInvoicePdf(gatewayPaymentId)
    expect(url).toBe('https://example.com/test-membership-invoice.pdf')
    expect(await prisma.invoice.findUnique({ where: { paymentId: payment.id } })).toMatchObject({ totalPaise: 19900, lineItems: [{ description: 'VIP Membership', amountPaise: 19900 }] })
    expect(await createAndStoreInvoicePdf(gatewayPaymentId)).toBe(url)
    expect(put).toHaveBeenCalledTimes(1)
  } finally { await prisma.user.delete({ where: { id: user.id } }) }
})
afterAll(async () => { await prisma.$disconnect() })
