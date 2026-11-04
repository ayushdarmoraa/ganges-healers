import { applyWebhookSideEffects } from '@/lib/payments/webhook-apply'
import { applyMembershipEvent } from '@/lib/memberships/webhook'
import { createAndStoreInvoicePdf } from '@/lib/invoices'

jest.mock('@/lib/memberships/webhook', () => ({ applyMembershipEvent: jest.fn() }))
jest.mock('@/lib/invoices', () => ({ createAndStoreInvoicePdf: jest.fn() }))
const apply = jest.mocked(applyMembershipEvent)
beforeEach(() => jest.clearAllMocks())

test('delegates verified subscription events to the ownership-aware membership handler', async () => {
  apply.mockResolvedValue({ applied: true, action: 'subscription.update' })
  const event = { event: 'subscription.activated' }
  await expect(applyWebhookSideEffects(event)).resolves.toEqual({ applied: true, action: 'subscription.update' })
  expect(apply).toHaveBeenCalledWith(event)
  expect(createAndStoreInvoicePdf).not.toHaveBeenCalled()
})

test('invoices a fulfilled membership charge after commit', async () => {
  apply.mockResolvedValue({ applied: true, action: 'subscription.charge', gatewayPaymentId: 'pay_member' })
  await applyWebhookSideEffects({ event: 'subscription.charged' })
  expect(createAndStoreInvoicePdf).toHaveBeenCalledWith('pay_member', { force: false })
})

test('reports failures so the webhook route can request a provider retry', async () => {
  apply.mockRejectedValue(new Error('database temporarily unavailable'))
  await expect(applyWebhookSideEffects({ event: 'subscription.charged' })).resolves.toEqual({ applied: false, reason: 'apply-error' })
})
