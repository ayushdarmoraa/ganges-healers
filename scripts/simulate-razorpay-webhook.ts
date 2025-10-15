#!/usr/bin/env ts-node
/*
  Local Razorpay webhook simulator
  - Reads raw JSON file
  - Computes HMAC SHA-256 with secret
  - POSTs to webhook URL with x-razorpay-signature header
*/

import { createHmac } from 'crypto'
import { readFileSync } from 'fs'
import http from 'http'
import https from 'https'
import { URL } from 'url'

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {}
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const [k, v] = a.split('=')
      if (v !== undefined) args[k.slice(2)] = v
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        args[k.slice(2)] = argv[++i]
      } else {
        args[k.slice(2)] = true
      }
    }
  }
  return args
}

async function main() {
  const args = parseArgs(process.argv)
  const url = (args.url as string) || 'http://localhost:3000/api/payments/webhook'
  const secret = (args.secret as string) || process.env.RAZORPAY_WEBHOOK_SECRET || ''
  const file = args.file as string
  if (!file) {
    console.error('Missing --file path to JSON payload')
    process.exit(1)
  }
  if (!secret) {
    console.error('Missing --secret or RAZORPAY_WEBHOOK_SECRET env')
    process.exit(1)
  }

  // Read raw file contents without mutation
  const raw = readFileSync(file)
  const hmac = createHmac('sha256', secret).update(raw).digest('hex')
  const u = new URL(url)
  const client = u.protocol === 'https:' ? https : http

  const options: https.RequestOptions = {
    method: 'POST',
    hostname: u.hostname,
    port: u.port || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname + (u.search || ''),
    headers: {
      'content-type': 'application/json',
      'x-razorpay-signature': hmac,
      'content-length': Buffer.byteLength(raw)
    }
  }

  await new Promise<void>((resolve) => {
    const req = client.request(options, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        const short = hmac.slice(0, 8)
        console.log(`[sim] sig=${short} status=${res.statusCode}`)
        try {
          const json = JSON.parse(body)
          console.log(json)
        } catch {
          if (body) console.log(body)
        }
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) process.exitCode = 0
        else process.exitCode = 1
        resolve()
      })
    })
    req.on('error', (err) => {
      console.error('[sim][error]', err.message)
      process.exitCode = 1
      resolve()
    })
    req.write(raw)
    req.end()
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
