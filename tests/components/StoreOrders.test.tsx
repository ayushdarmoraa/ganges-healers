import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import OrdersPage from '@/app/dashboard/orders/page'
import OrderDetailsPage from '@/app/dashboard/orders/[id]/page'
import OrdersError from '@/app/dashboard/orders/error'
import OrdersLoading from '@/app/dashboard/orders/loading'
import OrderNotFound from '@/app/dashboard/orders/[id]/not-found'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ prisma: { order: { findMany: jest.fn(), findFirst: jest.fn() } } }))
jest.mock('next/navigation', () => ({
  redirect: jest.fn((url: string) => { throw new Error(`redirect:${url}`) }),
  notFound: jest.fn(() => { throw new Error('not-found') }),
}))

const auth = jest.requireMock<{ auth: jest.Mock }>('@/lib/auth').auth
const db = jest.requireMock<{ prisma: { order: { findMany: jest.Mock; findFirst: jest.Mock } } }>('@/lib/prisma').prisma
const params = { params: Promise.resolve({ id: 'order-1' }) }
const address = { name: 'Test Customer', line1: 'Practice Road', city: 'Rishikesh', state: 'Uttarakhand', postalCode: '249201' }
const order = (index = 1, status = 'paid') => ({
  id: `order-${index}`, status, totalPaise: 120000, createdAt: new Date('2026-10-31T12:00:00Z'),
  shippingAddress: address,
  items: [{ id: `item-${index}`, quantity: 3, pricePaise: 120000, product: { title: 'Practice Mat', slug: 'practice-mat', imageUrl: null } }],
})

beforeEach(() => {
  jest.clearAllMocks()
  auth.mockResolvedValue({ user: { id: 'owner' } })
  db.order.findMany.mockResolvedValue([])
  db.order.findFirst.mockResolvedValue(order())
})

test.each([null, { user: {} }, { user: { id: '' } }])('refuses an incomplete session before either order query', async session => {
  auth.mockResolvedValue(session)
  await expect(OrdersPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/auth/signin')
  await expect(OrderDetailsPage(params)).rejects.toThrow('redirect:/auth/signin')
  expect(db.order.findMany).not.toHaveBeenCalled()
  expect(db.order.findFirst).not.toHaveBeenCalled()
})

test('keeps filtering, pagination and empty-page recovery scoped to the current account', async () => {
  render(await OrdersPage({ searchParams: Promise.resolve({ status: 'paid', page: '2' }) }))
  expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { userId: 'owner', status: 'paid' }, skip: 50, take: 51,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  }))
  expect(screen.getByRole('link', { name: 'Paid' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/dashboard/orders?status=paid')
  expect(screen.getByRole('link', { name: 'Shipped' })).toHaveAttribute('href', '/dashboard/orders?status=shipped')
})

test('treats repeated or malformed query parameters as the first unfiltered page', async () => {
  render(await OrdersPage({ searchParams: Promise.resolve({ status: ['paid', 'shipped'], page: ['2', '3'] }) }))
  expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner' }, skip: 0 }))
  expect(screen.getByText("You haven't placed any orders yet.")).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Browse Store' })).toHaveAttribute('href', '/store')
})

test('uses the extra record only for the next-page link', async () => {
  db.order.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, index) => order(index)))
  render(await OrdersPage({ searchParams: Promise.resolve({ status: 'paid' }) }))
  expect(screen.getAllByRole('link', { name: 'View details' })).toHaveLength(50)
  expect(screen.getByRole('link', { name: 'Next page' })).toHaveAttribute('href', '/dashboard/orders?status=paid&page=2')
})

test('does not link beyond the maximum supported page', async () => {
  db.order.findMany.mockResolvedValue(Array.from({ length: 51 }, (_, index) => order(index)))
  render(await OrdersPage({ searchParams: Promise.resolve({ status: 'paid', page: '1001' }) }))
  expect(db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 49950 }))
  expect(screen.getByText('Page 1000')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Next page' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Previous page' })).toHaveAttribute('href', '/dashboard/orders?status=paid&page=999')
})

test('loads only the owned order and displays saved line totals without multiplying quantity twice', async () => {
  render(await OrderDetailsPage(params))
  expect(db.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'order-1', userId: 'owner' } }))
  expect(screen.getByText('Quantity: 3')).toBeInTheDocument()
  expect(screen.getAllByText('₹1,200.00')).toHaveLength(2)
  expect(screen.queryByText('₹3,600.00')).not.toBeInTheDocument()
  expect(screen.getByText('Practice Road')).toBeInTheDocument()
  const progress = screen.getByRole('list', { name: 'Order progress' })
  expect(within(progress).getByText('Paid').closest('li')).toHaveAttribute('aria-current', 'step')
})

test('does not disclose an unavailable or unowned order', async () => {
  db.order.findFirst.mockResolvedValue(null)
  await expect(OrderDetailsPage(params)).rejects.toThrow('not-found')
})

test('shows cancelled orders without suggesting that delivery will continue', async () => {
  db.order.findFirst.mockResolvedValue({ ...order(1, 'cancelled'), shippingAddress: { invalid: true } })
  render(await OrderDetailsPage(params))
  expect(screen.getByRole('status')).toHaveTextContent('This order has been cancelled.')
  expect(screen.queryByRole('list', { name: 'Order progress' })).not.toBeInTheDocument()
  expect(screen.getByText('No shipping address was saved for this order.')).toBeInTheDocument()
})

test('offers a working retry after an order-loading failure', async () => {
  const reset = jest.fn()
  render(<OrdersError reset={reset} />)
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('alert')).toHaveTextContent('Orders are temporarily unavailable')
})

test('announces loading and gives unavailable orders a route back to owned history', () => {
  const { unmount } = render(<OrdersLoading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading order information')
  unmount()
  render(<OrderNotFound />)
  expect(screen.getByRole('heading', { name: 'Order unavailable' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Back to all orders' })).toHaveAttribute('href', '/dashboard/orders')
})
