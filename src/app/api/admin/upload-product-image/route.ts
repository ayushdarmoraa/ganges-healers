import { NextResponse } from 'next/server'
import { requireCurrentAdmin } from '@/lib/admin/auth'
import { put } from '@vercel/blob'
import { randomUUID } from 'node:crypto'
import { hasProductImageSignature, isAllowedArticleImage, productImageError, PRODUCT_IMAGE_MAX_BYTES } from '@/config/images'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const headers = { 'Cache-Control': 'private, no-store' }

export async function POST(req: Request) {
  try { await requireCurrentAdmin() } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }

  try {
    const length = req.headers.get('content-length')
    if (length && Number(length) > PRODUCT_IMAGE_MAX_BYTES + 65536) return NextResponse.json({ error: 'Images must be 4 MB or smaller.' }, { status: 413, headers })
    let formData: FormData
    try { formData = await req.formData() } catch { return NextResponse.json({ error: 'Choose a JPEG, PNG or WebP image.' }, { status: 400, headers }) }
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400, headers })
    }

    const validationError = productImageError(file)
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400, headers })
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!hasProductImageSignature(bytes, file.type)) return NextResponse.json({ error: 'The file contents do not match its image format. Choose another image.' }, { status: 400, headers })
    // A dedicated product-photo credential does not activate invoice PDF uploads.
    const token = process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_READ_WRITE_TOKEN?.trim()
    if (!token) return NextResponse.json({ error: 'Image uploads are temporarily unavailable. Please try again later.' }, { status: 503, headers })
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp'
    const pathname = `products/${randomUUID()}.${ext}`
    const blob = await put(pathname, Buffer.from(bytes), {
      access: 'public',
      token,
      contentType: file.type,
      addRandomSuffix: false,
      allowOverwrite: false,
    })
    if (!blob.url || !isAllowedArticleImage(blob.url)) throw new Error('Invalid storage response')

    console.log('[admin][upload-product-image][uploaded]', { pathname })

    return NextResponse.json({ url: blob.url }, { headers })
  } catch (err) {
    console.error('[admin][upload-product-image][error]', { type: err instanceof Error ? err.name : 'unknown' })
    return NextResponse.json({ error: 'Image upload failed' }, { status: 500, headers })
  }
}
