/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSession } from 'next-auth/react';

import BookingModal from '@/components/booking/BookingModal';

// Mock the useSession hook
const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

// Make global fetch mockable
beforeAll(() => {
  (global as any).fetch = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  (global.fetch as any).mockReset();
});

// Mock Razorpay on window when needed
function installRazorpayMock(cb?: () => void) {
  (window as any).Razorpay = function (opts: any) {
    return {
      open: () => cb && cb(),
      on: opts?.handler ? (_event: string, _handler: any) => {} : () => {},
      close: () => {},
    };
  };
}

const healer = { 
  id: 'h_1', 
  user: { name: 'Healer One', image: '' },
  experienceYears: 5,
  rating: 4.8
};

const serviceId = 's_1';
const serviceName = 'Reiki Healing';

function mockAvailability(slots: Array<{ time: string; available: boolean }>) {
  (global.fetch as any).mockImplementationOnce((_url: string) =>
    Promise.resolve(new Response(JSON.stringify({ 
      data: { slots } 
    }), { status: 200 })),
  );
}

function mockCreateBooking(ok: boolean, bookingId = 'b_1') {
  (global.fetch as any).mockImplementationOnce((_url: string, init: any) => {
    return Promise.resolve(
      new Response(
        ok
          ? JSON.stringify({ data: { id: bookingId, status: 'PENDING' } })
          : JSON.stringify({ error: 'Failed to create booking' }),
        { status: ok ? 201 : 400 },
      ),
    );
  });
}

function mockConfirmWithCredits(ok: boolean) {
  (global.fetch as any).mockImplementationOnce((_url: string, _init: any) =>
    Promise.resolve(new Response(JSON.stringify(ok ? { ok: true } : { error: 'No credits' }), { status: ok ? 200 : 400 })),
  );
}

function mockCreateOrder(ok: boolean, orderId = 'order_123') {
  (global.fetch as any).mockImplementationOnce((_url: string, _init: any) =>
    Promise.resolve(
      new Response(
        ok ? JSON.stringify({ 
          key_id: 'rzp_test_key',
          amount: 50000,
          orderId: orderId 
        }) : JSON.stringify({ error: 'Order failed' }),
        { status: ok ? 200 : 500 },
      ),
    ),
  );
}

describe('BookingModal', () => {
  test('VIP user path: picks date/time → creates booking → confirms with credits (no Razorpay)', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    // Mock VIP session with credits
    mockUseSession.mockReturnValue({
      data: {
        user: { 
          id: 'u_vip', 
          vip: true, 
          freeSessionCredits: 1,
          email: 'vip@test.com',
          name: 'VIP User'
        }
      } as any,
      status: 'authenticated',
      update: jest.fn()
    });

    render(
      <BookingModal
        isOpen={true}
        onClose={onClose}
        healer={healer}
        serviceId={serviceId}
        serviceName={serviceName}
      />
    );

    // Should start on date selection step
    expect(screen.getByText('Select Date')).toBeInTheDocument();

    // Mock availability call before selecting date
    mockAvailability([
      { time: '11:00', available: true },
      { time: '11:30', available: true }
    ]);

    // Select a date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const dateInput = screen.getByDisplayValue('');
    await user.type(dateInput, dateStr);

    // Wait for availability to load and move to time selection
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/availability')
      );
    });

    // Should show time selection with available slots
    await waitFor(() => {
      expect(screen.getByText('11:00 AM')).toBeInTheDocument();
    });

    // Mock the booking creation and credit confirmation calls
    mockCreateBooking(true);
    mockConfirmWithCredits(true);

    // Select time button
    const timeBtn = screen.getByText('11:00 AM');
    await user.click(timeBtn);

    // Should now be on confirm step - click confirm button
    const confirmBtn = await screen.findByText('Confirm & Pay');
    await user.click(confirmBtn);

    // Should have called create booking -> then confirm-with-credits
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/bookings',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/confirm-with-credits/),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // Should show success state
    await waitFor(() => {
      expect(screen.getByText(/booking confirmed/i)).toBeInTheDocument();
    });
  });

  test('Non-VIP path: creates booking → creates Razorpay order → opens Checkout', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    // Mock non-VIP session
    mockUseSession.mockReturnValue({
      data: {
        user: { 
          id: 'u_std', 
          vip: false, 
          freeSessionCredits: 0,
          email: 'user@test.com',
          name: 'Regular User'
        }
      } as any,
      status: 'authenticated',
      update: jest.fn()
    });

    // Availability
    mockAvailability([{ time: '12:00', available: true }]);
    // Create booking
    mockCreateBooking(true, 'b_rzp');
    // Order
    mockCreateOrder(true, 'order_999');

    // Install Razorpay mock to assert it opens
    const opened = { value: false };
    installRazorpayMock(() => { opened.value = true; });

    render(
      <BookingModal
        isOpen={true}
        onClose={onClose}
        healer={healer}
        serviceId={serviceId}
        serviceName={serviceName}
      />
    );

    // Select date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const dateInput = screen.getByDisplayValue('');
    await user.type(dateInput, dateStr);

    // Wait for availability and pick time
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    
    const timeBtn = await screen.findByText('12:00 PM');
    await user.click(timeBtn);

    // Click the "Confirm & Pay" button which triggers the Razorpay order call
    const confirmBtn = await screen.findByRole('button', { name: /confirm\s*&\s*pay/i });
    await user.click(confirmBtn);

    // Order API must be called
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/api\/payments\/razorpay\/order/),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    // Razorpay checkout should open
    await waitFor(() => expect(opened.value).toBe(true));
  });

  test('Handles order API failure with an error message', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    // Clear any existing Razorpay mock from previous tests
    delete (window as any).Razorpay;

    // Mock non-VIP session
    mockUseSession.mockReturnValue({
      data: {
        user: { 
          id: 'u_err', 
          vip: false, 
          freeSessionCredits: 0,
          email: 'error@test.com',
          name: 'Error User'
        }
      } as any,
      status: 'authenticated',
      update: jest.fn()
    });

    // Availability
    mockAvailability([{ time: '14:00', available: true }]);
    // Booking ok
    mockCreateBooking(true, 'b_fail');
    // Order fails
    mockCreateOrder(false);

    render(
      <BookingModal
        isOpen={true}
        onClose={onClose}
        healer={healer}
        serviceId={serviceId}
        serviceName={serviceName}
      />
    );

    // Select date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const dateInput = screen.getByDisplayValue('');
    await user.type(dateInput, dateStr);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    
    const timeBtn = await screen.findByText('2:00 PM');
    await user.click(timeBtn);

    // Click the "Confirm & Pay" button which triggers the Razorpay order call
    const confirmBtn = await screen.findByRole('button', { name: /confirm\s*&\s*pay/i });
    await user.click(confirmBtn);

    // Order API was attempted…
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/api\/payments\/razorpay\/order/),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    // …and Razorpay should NOT open when order creation fails
    expect((window as any).Razorpay).toBeUndefined();
  });

  test('Shows no available slots message when no slots are available', async () => {
    const onClose = jest.fn();

    // Mock session
    mockUseSession.mockReturnValue({
      data: {
        user: { 
          id: 'u_test', 
          vip: false, 
          freeSessionCredits: 0,
          email: 'test@test.com',
          name: 'Test User'
        }
      } as any,
      status: 'authenticated',
      update: jest.fn()
    });

    // Mock no available slots
    mockAvailability([
      { time: '11:00', available: false },
      { time: '12:00', available: false }
    ]);

    render(
      <BookingModal
        isOpen={true}
        onClose={onClose}
        healer={healer}
        serviceId={serviceId}
        serviceName={serviceName}
      />
    );

    // Select date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    const dateInput = screen.getByDisplayValue('');
    await userEvent.setup().type(dateInput, dateStr);

    // Should show no available slots message
    await waitFor(() => {
      expect(screen.getByText(/no available slots/i)).toBeInTheDocument();
    });
  });
});