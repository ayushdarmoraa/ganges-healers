import type { Metadata } from 'next'
import { canonicalOf } from '@/config/site'
import * as Page from '@/app/services/page'

describe('services index metadata', () => {
  test('generateMetadata returns canonical title and URL', async () => {
    const meta = (await Page.generateMetadata()) as Metadata
    expect(meta.title).toBe('Services | Ganges Healers')
    expect(meta.alternates?.canonical).toBe(canonicalOf('/services'))
  })
})
