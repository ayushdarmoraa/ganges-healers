// Force IST so slot calculations are deterministic
process.env.TZ = 'Asia/Kolkata';

// Set required environment variables for testing
process.env.RAZORPAY_KEY_ID = 'test_key_id';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret';
process.env.NEXTAUTH_SECRET = 'test-secret';
process.env.NEXTAUTH_URL = 'http://localhost:3000';

// Mock next-auth/react to avoid ESM client import issues in JSDOM-less tests
jest.mock('next-auth/react', () => ({
	useSession: () => ({ data: { user: { id: 'test', email: 'test@example.com' } }, status: 'authenticated' }),
}))
