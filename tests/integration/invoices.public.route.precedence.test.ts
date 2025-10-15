/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as InvoiceRoute from '@/app/api/invoices/[id]/route'

function get(url: string) {
  return new NextRequest(new Request(url, { method: 'GET' }) as any)
}

describe('Invoices public route precedence', () => {
  let paymentIdLegacy: string
  let paymentIdRel: string
  let invoiceNumberDirect: string
  let paymentGateway: { pay: string; ord: string }

  beforeAll(async () => {
  // Legacy path: create payment; we'll mock the raw select to simulate legacy invoiceUrl column
  const p1 = await prisma.payment.create({ data: { gateway: 'razorpay', status: 'success', amountPaise: 1000 } })
  paymentIdLegacy = p1.id

    // Relation path: Payment with related Invoice
    const p2 = await prisma.payment.create({ data: { gateway: 'razorpay', status: 'success', amountPaise: 2000 } })
    paymentIdRel = p2.id
  await prisma.invoice.create({ data: { paymentId: p2.id, invoiceNumber: `INV-REL-${Date.now()}`, billTo: { n: 1 }, lineItems: [], subtotalPaise: 2000, taxPaise: 0, totalPaise: 2000, pdfUrl: `https://blob.example.com/relation-${p2.id}.pdf` } })

    // Invoice number direct lookup
    const invDirect = await prisma.invoice.create({ data: { paymentId: (await prisma.payment.create({ data: { gateway: 'razorpay', status: 'success', amountPaise: 3000 } })).id, invoiceNumber: `INV-DIR-${Date.now()}`, billTo: { n: 2 }, lineItems: [], subtotalPaise: 3000, taxPaise: 0, totalPaise: 3000, pdfUrl: `https://blob.example.com/invnum-${Date.now()}.pdf` } })
    invoiceNumberDirect = invDirect.invoiceNumber

  // Gateway IDs path
  const uniq = Date.now().toString(36)
  const p3 = await prisma.payment.create({ data: { gateway: 'razorpay', status: 'success', amountPaise: 4000, gatewayPaymentId: `pay_test_${uniq}`, gatewayOrderId: `order_test_${uniq}` } })
    paymentGateway = { pay: p3.gatewayPaymentId!, ord: p3.gatewayOrderId! }
    await prisma.invoice.create({ data: { paymentId: p3.id, invoiceNumber: `INV-GW-${Date.now()}`, billTo: { n: 3 }, lineItems: [], subtotalPaise: 4000, taxPaise: 0, totalPaise: 4000, pdfUrl: `https://blob.example.com/gateway-${p3.id}.pdf` } })
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('legacy fast path → 302 Location=invoiceUrl', async () => {
    const spy = jest.spyOn(prisma as any, '$queryRaw').mockResolvedValue([{ invoiceUrl: `https://blob.example.com/legacy-${paymentIdLegacy}.pdf` }])
    const req = get(`http://localhost/api/invoices/${paymentIdLegacy}`)
    const res = await (InvoiceRoute as any).GET(req, { params: Promise.resolve({ id: paymentIdLegacy }) })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`https://blob.example.com/legacy-${paymentIdLegacy}.pdf`)
    spy.mockRestore()
  })

  test('relation path → 302 Location=Payment.invoice.pdfUrl', async () => {
    const req = get(`http://localhost/api/invoices/${paymentIdRel}`)
    const res = await (InvoiceRoute as any).GET(req, { params: Promise.resolve({ id: paymentIdRel }) })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`https://blob.example.com/relation-${paymentIdRel}.pdf`)
  })

  test('invoice number direct → 302 Location=Invoice.pdfUrl', async () => {
    const req = get(`http://localhost/api/invoices/${invoiceNumberDirect}`)
    const res = await (InvoiceRoute as any).GET(req, { params: Promise.resolve({ id: invoiceNumberDirect }) })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toMatch('https://blob.example.com/invnum-')
  })

  test('gateway ids → 302 Location=related invoice url', async () => {
  const r1 = await (InvoiceRoute as any).GET(get(`http://localhost/api/invoices/${paymentGateway.pay}`), { params: Promise.resolve({ id: paymentGateway.pay }) })
  expect(r1.status).toBe(302)
  expect(r1.headers.get('location')).toMatch('https://blob.example.com/gateway-')
    const r2 = await (InvoiceRoute as any).GET(get(`http://localhost/api/invoices/${paymentGateway.ord}`), { params: Promise.resolve({ id: paymentGateway.ord }) })
    expect(r2.status).toBe(302)
  })

  test('unknown id → 404', async () => {
    const req = get(`http://localhost/api/invoices/unknown_${Date.now()}`)
    const res = await (InvoiceRoute as any).GET(req, { params: Promise.resolve({ id: `unknown_${Date.now()}` }) })
    expect(res.status).toBe(404)
  })
})
