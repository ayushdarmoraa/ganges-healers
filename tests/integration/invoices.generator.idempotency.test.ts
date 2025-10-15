/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from '@/lib/prisma'
import { NextRequest } from 'next/server'
import * as AdminGen from '@/app/api/invoices/generate/route'

// Mock the low-level upload wrapper used by the generator's storage flow
jest.mock('@/lib/invoices/storage', () => ({
  uploadInvoicePDF: async (args: any) => ({ url: `https://blob.example.com/mock-${Date.now()}.pdf`, skipped: false, path: `invoices/mock/${args.invoiceNumber}.pdf` })
}))

// Also mock the PDF generator to avoid heavy work
jest.mock('@/lib/invoices/pdf', () => ({
  generateInvoicePDF: async () => Buffer.from('%PDF-1.4 MOCK')
}))

// Mock auth to avoid importing next-auth ESM internals in Jest
jest.mock('@/lib/auth', () => ({
  auth: async () => ({ user: { id: 'test-user', role: 'ADMIN' } })
}))

describe('Invoices generator idempotency via admin route', () => {
  function post(body: any) {
    return new NextRequest(new Request('http://localhost/api/invoices/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) as any)
  }

  afterAll(async () => {
    await prisma.$disconnect()
  })

  test('legacy present → returns legacy URL; uploader not called (mocked legacy path)', async () => {
    const p = await prisma.payment.create({ data: { gateway: 'razorpay', status: 'success', amountPaise: 1111 } })
    const legacyUrl = `https://blob.example.com/legacy-${p.id}.pdf`
    const spy = jest.spyOn(prisma as any, '$queryRaw').mockResolvedValue([{ invoiceUrl: legacyUrl }])
    const res = await (AdminGen as any).POST(post({ paymentId: p.id }))
    expect(res.status).toBeLessThan(300)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.url).toBe(legacyUrl)
    spy.mockRestore()
  })

  test('invoice present, legacy absent → returns existing pdfUrl; uploader not called', async () => {
    const p = await prisma.payment.create({ data: { gateway: 'razorpay', status: 'SUCCESS', statusEnum: 'SUCCESS', amountPaise: 2222 } })
    const inv = await prisma.invoice.create({ data: { paymentId: p.id, invoiceNumber: `INV-TEST-${Date.now()}`, billTo: { a: 1 }, lineItems: [], subtotalPaise: 2222, taxPaise: 0, totalPaise: 2222, pdfUrl: `https://blob.example.com/existing-${p.id}.pdf` } })
    const res = await (AdminGen as any).POST(post({ paymentId: p.id }))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.url).toBe(inv.pdfUrl)
  })

  test('force regeneration → different URL, invoice updated', async () => {
    const p = await prisma.payment.create({ data: { gateway: 'razorpay', status: 'success', amountPaise: 3333 } })
    const invOld = await prisma.invoice.create({ data: { paymentId: p.id, invoiceNumber: `INV-TEST-${Date.now()}`, billTo: { a: 2 }, lineItems: [], subtotalPaise: 3333, taxPaise: 0, totalPaise: 3333, pdfUrl: `https://blob.example.com/old-${p.id}.pdf` } })
    const res = await (AdminGen as any).POST(post({ paymentId: p.id, force: true }))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(typeof json.url).toBe('string')
    expect(json.url).not.toBe(invOld.pdfUrl)
    const updated = await prisma.invoice.findUnique({ where: { id: invOld.id } })
    expect(updated?.pdfUrl).toBe(json.url)
  })

  test('fresh path → uploads once, returns url', async () => {
    const p = await prisma.payment.create({ data: { gateway: 'razorpay', status: 'success', amountPaise: 4444 } })
    const res = await (AdminGen as any).POST(post({ paymentId: p.id }))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(typeof json.url).toBe('string')
    const inv = await prisma.invoice.findUnique({ where: { paymentId: p.id } })
    expect(inv?.pdfUrl).toBe(json.url)
  })
})
