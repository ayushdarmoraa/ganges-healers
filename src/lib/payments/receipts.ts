import { randomUUID } from 'node:crypto'

/** Razorpay receipts must be unique and at most 40 characters, including their prefix. */
export function createGatewayReceipt(prefix: 'pay' | 'prog' | 'store' | 'course'): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`
}
