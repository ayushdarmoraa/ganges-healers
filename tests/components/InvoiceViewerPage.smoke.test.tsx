import { render, screen } from '@testing-library/react'

jest.mock('@/lib/invoices/resolve', () => ({ resolveInvoiceUrl: jest.fn(async () => 'https://blob.vercel-storage.com/inv123.pdf') }))

import Page, { generateMetadata } from '@/app/invoices/[id]/view/page'

describe('InvoiceViewerPage smoke', () => {
  test('renders toolbar buttons and PDF embed with resolved URL', async () => {
    const renderPage = Page as unknown as (args: { params: Promise<{ id: string }> }) => Promise<React.ReactElement>
    const el = await renderPage({ params: Promise.resolve({ id: 'INV-123' }) })
    render(el)
    const open = screen.getByRole('link', { name: /open pdf/i })
    const download = screen.getByRole('link', { name: /download/i })
    expect(open).toHaveAttribute('href', 'https://blob.vercel-storage.com/inv123.pdf')
    expect(download).toHaveAttribute('href', 'https://blob.vercel-storage.com/inv123.pdf')
    const embed = screen.getByTitle(/invoice pdf/i)
    expect(embed).toBeInTheDocument()
  })

  test('notFound branch when URL missing', async () => {
    const mod = jest.requireMock('@/lib/invoices/resolve') as { resolveInvoiceUrl: jest.Mock }
    mod.resolveInvoiceUrl.mockResolvedValueOnce(null)
    const renderPage = Page as unknown as (args: { params: Promise<{ id: string }> }) => Promise<React.ReactElement>
    const elPromise = renderPage({ params: Promise.resolve({ id: 'UNKNOWN' }) })
    await expect(elPromise).rejects.toThrow()
  })
})

describe('metadata', () => {
  test('generateMetadata returns canonical and noindex', async () => {
    const md = await generateMetadata({ params: Promise.resolve({ id: 'INV-1001' }) })
    expect(md.title).toContain('Invoice INV-1001')
    const canonicalStr = String(md.alternates?.canonical || '')
    expect(canonicalStr.endsWith('/invoices/INV-1001/view')).toBe(true)
    const robotsObj = md.robots as { index?: boolean; follow?: boolean } | undefined
    expect(robotsObj?.index).toBe(false)
    expect(robotsObj?.follow).toBe(false)
  })
})
