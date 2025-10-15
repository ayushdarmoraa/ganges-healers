import type { Metadata } from 'next'
import { generateMetadata } from '@/app/invoices/[id]/view/page'

describe('invoice view metadata', () => {
  test('title, canonical, and noindex', async () => {
    const md = (await generateMetadata({ params: Promise.resolve({ id: 'INV-1001' }) })) as Metadata
    expect(md.title).toBe('Invoice INV-1001 | Ganges Healers')
    const canonicalStr = String(md.alternates?.canonical || '')
    expect(canonicalStr.endsWith('/invoices/INV-1001/view')).toBe(true)
    const robotsObj = md.robots as { index?: boolean; follow?: boolean } | undefined
    expect(robotsObj?.index).toBe(false)
    expect(robotsObj?.follow).toBe(false)
  })
})
