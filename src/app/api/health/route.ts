export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
      pragma: 'no-cache',
      expires: '0'
    }
  })
}
