export type RefundBand = 'FULL' | 'HALF' | 'NONE'

export function computeRefund(bookingStart: Date, cancelAt: Date, pricePaise: number): { band: RefundBand; refundPaise: number } {
  const diffMs = bookingStart.getTime() - cancelAt.getTime()
  const hours = diffMs / (1000 * 60 * 60)
  if (hours >= 48) {
    return { band: 'FULL', refundPaise: Math.max(0, Math.floor(pricePaise)) }
  }
  if (hours >= 24) {
    return { band: 'HALF', refundPaise: Math.max(0, Math.floor(pricePaise / 2)) }
  }
  return { band: 'NONE', refundPaise: 0 }
}
