import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSession } from 'next-auth/react'
import { OrderPaymentButton } from '@/components/store/OrderPaymentButton'
import { openRazorpayCheckout } from '@/lib/payments/openRazorpayCheckout'

jest.mock('next-auth/react', () => ({ useSession: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
jest.mock('@/lib/payments/openRazorpayCheckout', () => ({ openRazorpayCheckout: jest.fn() }))
const mockRefresh = jest.fn()
const quote = { orderId: 'order_pending', amountPaise: 24000, currency: 'INR', key: 'public_key' }
const proof = { razorpay_order_id: 'order_pending', razorpay_payment_id: 'pay_saved', razorpay_signature: 'signed' }
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status }) }
function mount() { return render(<OrderPaymentButton orderId="saved-order" ownerId="buyer" />) }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'buyer', email: 'buyer@example.test' } }, status: 'authenticated' } as never)
  jest.mocked(openRazorpayCheckout).mockResolvedValue(proof)
})
afterEach(() => jest.restoreAllMocks())

test('continues the saved order using the server quote and refreshes only after explicit verification', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => response(url === '/api/payments/create-order' ? quote : { verified: true }))
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1))
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string)).toEqual({ type: 'STORE', metadata: { orderId: 'saved-order' } })
  expect(openRazorpayCheckout).toHaveBeenCalledWith(expect.objectContaining({ orderId: 'order_pending', amountPaise: 24000 }))
  expect(JSON.parse(fetch.mock.calls[1][1]!.body as string)).toEqual({ orderId: 'order_pending', paymentId: 'pay_saved', signature: 'signed' })
  expect(screen.getByRole('button', { name: 'Payment confirmed' })).toBeDisabled()
})

test('a lost confirmation retries the signed proof without another quote or gateway dialog', async () => {
  let verifyCalls = 0
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async url => {
    if (url === '/api/payments/create-order') return response(quote)
    if (++verifyCalls === 1) throw new TypeError('Failed to fetch')
    return response({ verified: true })
  })
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('We could not confirm your payment')
  expect(mockRefresh).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Confirm payment' }))
  await waitFor(() => expect(mockRefresh).toHaveBeenCalledTimes(1))
  expect(openRazorpayCheckout).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls.filter(([url]) => url === '/api/payments/create-order')).toHaveLength(1)
})

test('dismissed payments remain resumable and unconfirmed responses cannot report completion', async () => {
  jest.spyOn(globalThis, 'fetch').mockImplementation(async url => response(url === '/api/payments/create-order' ? quote : { ok: true }))
  jest.mocked(openRazorpayCheckout).mockRejectedValueOnce(new Error('Payment dismissed'))
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Payment was cancelled')
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Payment confirmation is pending')
  expect(mockRefresh).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Confirm payment' })).toBeEnabled()
})

test.each([null, { orderId: 'order_pending' }, { ...quote, amountPaise: -1 }, { ...quote, currency: 'USD' }])('malformed quotes cannot open the gateway (%#)', async data => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(data))
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Payment could not be prepared')
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})

test('a purchase that is no longer pending refreshes its server status without opening payment', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(response({ error: 'Order is not awaiting payment' }, 409))
  mount()
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Order is not awaiting payment')
  expect(mockRefresh).toHaveBeenCalledTimes(1)
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})

test('a session change during quote preparation cannot pay as the previous owner', async () => {
  let resolve!: (response: Response) => void
  const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(done => { resolve = done }))
  const view = mount()
  await userEvent.click(screen.getByRole('button', { name: 'Continue payment' }))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
  jest.mocked(useSession).mockReturnValue({ data: { user: { id: 'other' } }, status: 'authenticated' } as never)
  view.rerender(<OrderPaymentButton orderId="saved-order" ownerId="buyer" />)
  resolve(response(quote))
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to the account that placed this order')
  expect(await screen.findByRole('button', { name: 'Continue payment' })).toBeDisabled()
  expect(openRazorpayCheckout).not.toHaveBeenCalled()
})
