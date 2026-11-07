import { POST } from '@/app/api/admin/upload-product-image/route'
import { hasProductImageSignature, productImageError, productImageFields, PRODUCT_IMAGE_MAX_BYTES } from '@/config/images'

jest.mock('@/lib/admin/auth', () => ({ requireCurrentAdmin: jest.fn() }))
jest.mock('@vercel/blob', () => ({ put: jest.fn() }))
jest.mock('@vercel/oidc', () => ({ getVercelOidcToken: jest.fn() }))
const guard = jest.requireMock<{ requireCurrentAdmin: jest.Mock }>('@/lib/admin/auth').requireCurrentAdmin
const put = jest.requireMock<{ put: jest.Mock }>('@vercel/blob').put
const getOidcToken = jest.requireMock<{ getVercelOidcToken: jest.Mock }>('@vercel/oidc').getVercelOidcToken
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCioAAAAASUVORK5CYII=', 'base64')
const url = 'https://photos.public.blob.vercel-storage.com/products/photo.png'
const saved = { storeId: process.env.PRODUCT_IMAGES_BLOB_STORE_ID, dedicated: process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN, legacy: process.env.BLOB_READ_WRITE_TOKEN }
function request(bytes: Uint8Array = png, type = 'image/png', name = 'private-customer-name.png') {
  const form = new FormData(); form.set('file', new File([Buffer.from(bytes)], name, { type }))
  return new Request('http://localhost/api/admin/upload-product-image', { method: 'POST', body: form })
}
beforeEach(() => { jest.clearAllMocks(); guard.mockResolvedValue({ id: 'admin' }); put.mockResolvedValue({ url }); getOidcToken.mockReset().mockResolvedValue('fresh-oidc-token'); delete process.env.PRODUCT_IMAGES_BLOB_STORE_ID; process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN = 'dedicated-test-token'; process.env.BLOB_READ_WRITE_TOKEN = 'legacy-test-token' })
afterAll(() => { for (const [key, value] of [['PRODUCT_IMAGES_BLOB_STORE_ID', saved.storeId], ['PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN', saved.dedicated], ['BLOB_READ_WRITE_TOKEN', saved.legacy]]) { if (value === undefined) delete process.env[key!]; else process.env[key!] = value } })

test('authorization runs before reading the upload body', async () => {
  guard.mockRejectedValue(new Error('Forbidden'))
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'
  const formData = jest.fn()
  const response = await POST({ formData } as unknown as Request)
  expect(response.status).toBe(403); expect(formData).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled(); expect(getOidcToken).not.toHaveBeenCalled()
})
test('safe raster uploads use a private response and random paths without original filenames', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ url }); expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(put).toHaveBeenCalledWith(expect.stringMatching(/^products\/[0-9a-f-]{36}\.png$/), png, { access: 'public', token: 'dedicated-test-token', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: false })
  expect(JSON.stringify(put.mock.calls)).not.toContain('private-customer-name')
  expect(getOidcToken).not.toHaveBeenCalled()
})
test('a connected dedicated store uploads using refreshed identity without long-lived tokens', async () => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'
  delete process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN
  const response = await POST(request())
  expect(response.status).toBe(200); expect(await response.json()).toEqual({ url })
  expect(put.mock.calls[0][2]).toEqual({ access: 'public', storeId: 'store_photos', oidcToken: 'fresh-oidc-token', contentType: 'image/png', addRandomSuffix: false, allowOverwrite: false })
})
test('each upload obtains a fresh identity rather than caching it between requests', async () => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'
  getOidcToken.mockResolvedValueOnce('identity-one').mockResolvedValueOnce('identity-two')
  expect((await POST(request())).status).toBe(200); expect((await POST(request())).status).toBe(200)
  expect(getOidcToken).toHaveBeenCalledTimes(2)
  expect(put.mock.calls.map(call => call[2].oidcToken)).toEqual(['identity-one', 'identity-two'])
  expect(put.mock.calls.every(call => call[2].token === undefined)).toBe(true)
})
test.each(['exception', 'empty', 'whitespace'])('a dedicated store with %s identity never falls back to the shared invoice token', async mode => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'
  delete process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN
  if (mode === 'exception') getOidcToken.mockRejectedValue(new Error('private identity details'))
  else getOidcToken.mockResolvedValue(mode === 'empty' ? '' : '   ')
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const response = await POST(request()); expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ error: 'Image uploads are temporarily unavailable. Please try again later.' })
    expect(put).not.toHaveBeenCalled(); expect(log).not.toHaveBeenCalled()
  } finally { log.mockRestore() }
})
test('an explicit dedicated product token remains a fallback when identity is unavailable', async () => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'
  getOidcToken.mockRejectedValue(new Error('identity unavailable'))
  expect((await POST(request())).status).toBe(200)
  expect(put.mock.calls[0][2]).toMatchObject({ token: 'dedicated-test-token' })
  expect(put.mock.calls[0][2]).not.toHaveProperty('oidcToken')
})
test('dedicated OIDC binding trims configuration and identity values', async () => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = ' store_photos '
  getOidcToken.mockResolvedValue(' fresh-oidc-token ')
  expect((await POST(request())).status).toBe(200)
  expect(put.mock.calls[0][2]).toMatchObject({ storeId: 'store_photos', oidcToken: 'fresh-oidc-token' })
})
test('an OIDC provider failure is not retried against a token or another store', async () => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    put.mockRejectedValue(new Error('secret identity in provider error'))
    const response = await POST(request()); expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Image upload failed' })
    expect(put).toHaveBeenCalledTimes(1); expect(put.mock.calls[0][2]).not.toHaveProperty('token')
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret identity')
  } finally { log.mockRestore() }
})
test('legacy storage remains compatible when no dedicated credential is configured', async () => {
  delete process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN
  expect((await POST(request())).status).toBe(200)
  expect(put.mock.calls[0][2].token).toBe('legacy-test-token')
})
test('missing storage fails explicitly without a fake URL', async () => {
  delete process.env.PRODUCT_IMAGES_BLOB_READ_WRITE_TOKEN; delete process.env.BLOB_READ_WRITE_TOKEN
  const response = await POST(request()); expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: 'Image uploads are temporarily unavailable. Please try again later.' }); expect(put).not.toHaveBeenCalled()
})
test('a claimed PNG containing HTML is rejected before provider access', async () => {
  process.env.PRODUCT_IMAGES_BLOB_STORE_ID = 'store_photos'
  expect((await POST(request(Buffer.from('<html>not an image</html>')))).status).toBe(400); expect(put).not.toHaveBeenCalled(); expect(getOidcToken).not.toHaveBeenCalled()
})
test.each([['empty', new Uint8Array(), 'image/png'], ['SVG', Buffer.from('<svg/>'), 'image/svg+xml'], ['oversize', new Uint8Array(PRODUCT_IMAGE_MAX_BYTES + 1), 'image/png']])('rejects %s files', async (_label, bytes, type) => {
  expect((await POST(request(bytes as Uint8Array, type as string))).status).toBe(400); expect(put).not.toHaveBeenCalled()
})
test('oversized declared multipart bodies are rejected before parsing', async () => {
  const formData = jest.fn(), headers = new Headers({ 'content-length': String(PRODUCT_IMAGE_MAX_BYTES + 65537) })
  expect((await POST({ formData, headers } as unknown as Request)).status).toBe(413); expect(formData).not.toHaveBeenCalled()
})
test('malformed multipart and missing files have recoverable 400 responses', async () => {
  expect((await POST(new Request('http://localhost/upload', { method: 'POST', body: '{' }))).status).toBe(400)
  expect((await POST(new Request('http://localhost/upload', { method: 'POST', body: new FormData() }))).status).toBe(400)
  expect(put).not.toHaveBeenCalled()
})
test.each(['javascript:alert(1)', 'https://user:password@photos.public.blob.vercel-storage.com/image.png', 'https://untrusted.example.test/image.png', ''])('malformed provider URLs cannot claim success: %s', async value => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try { put.mockResolvedValue({ url: value }); expect((await POST(request())).status).toBe(500) } finally { log.mockRestore() }
})
test('provider errors do not expose credentials or the original exception', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    put.mockRejectedValue(new Error('secret-provider-token in error'))
    const response = await POST(request()); expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: 'Image upload failed' })
    expect(log).toHaveBeenCalledWith('[admin][upload-product-image][error]', { type: 'Error' }); expect(JSON.stringify(log.mock.calls)).not.toContain('secret-provider-token')
  } finally { log.mockRestore() }
})
test.each([
  ['image/png', png], ['image/jpeg', new Uint8Array([255, 216, 255, 224])], ['image/webp', Buffer.from('RIFF0000WEBPVP8 ')],
])('recognizes the supported %s signature', (type, bytes) => expect(hasProductImageSignature(bytes, type)).toBe(true))
test.each(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])('does not accept arbitrary text or truncated headers as %s', type => { expect(hasProductImageSignature(Buffer.from('not-image'), type)).toBe(false); expect(hasProductImageSignature(new Uint8Array(), type)).toBe(false) })
test('browser/server metadata rules agree at the platform-compatible size boundary', () => {
  expect(productImageError({ type: 'image/png', size: PRODUCT_IMAGE_MAX_BYTES })).toBeNull()
  expect(productImageError({ type: 'image/png', size: PRODUCT_IMAGE_MAX_BYTES + 1 })).toMatch(/4 MB/)
  expect(productImageError({ type: 'image/png', size: 0 })).toMatch(/empty/)
  expect(productImageError({ type: 'application/pdf', size: 10 })).toMatch(/JPEG/)
})
test('saved image fields allow optional photos and normalize only the primary image', () => {
  expect(productImageFields('  ', [])).toEqual({ imageUrl: null, gallery: [] })
  expect(productImageFields(` ${url} `, [url])).toEqual({ imageUrl: url, gallery: [url] })
})
test.each([['javascript:alert(1)', []], [url, ['https://untrusted.example.test/photo.png']], [url, [null]], [url, 'not-an-array'], [url, Array(9).fill(url)]])('saved image fields reject unsupported or oversized galleries', (image, gallery) => {
  expect(() => productImageFields(image as string, gallery)).toThrow()
})
