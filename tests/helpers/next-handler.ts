import { NextRequest } from 'next/server'

export function makeNextRequest(
  url: string,
  init?: RequestInit & { nextCookies?: Record<string,string> }
) {
  const req = new Request(url, init)
  const nextReq = new NextRequest(req)
  if (init?.nextCookies) {
    const cookieHeader = Object.entries(init.nextCookies)
      .map(([k,v]) => `${k}=${v}`)
      .join('; ')
    nextReq.headers.set('cookie', cookieHeader)
  }
  return nextReq
}

export async function readJSON(res: Response) {
  const clone = res.clone()
  try { return await clone.json() } catch { return null }
}
