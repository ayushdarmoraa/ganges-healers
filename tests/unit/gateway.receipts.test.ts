import { createGatewayReceipt } from '@/lib/payments/receipts'

test.each(['pay', 'prog', 'store', 'course'] as const)('%s receipts stay within the gateway limit and retain their purchase prefix', prefix => {
  const receipt = createGatewayReceipt(prefix)
  expect(receipt).toMatch(new RegExp(`^${prefix}_[a-f0-9]{32}$`))
  expect(receipt.length).toBeLessThanOrEqual(40)
})

test('orders created during the same clock tick still have distinct receipts', () => {
  const clock = jest.spyOn(Date, 'now').mockReturnValue(1700000000000)
  try {
    const receipts = Array.from({ length: 1000 }, () => createGatewayReceipt('pay'))
    expect(new Set(receipts).size).toBe(receipts.length)
  } finally { clock.mockRestore() }
})
