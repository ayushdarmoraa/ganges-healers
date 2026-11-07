/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';
import 'jest-axe/extend-expect';
import 'whatwg-fetch';
import React from 'react';

// Minimal window/matchMedia for shadcn/radix
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Silence ResizeObserver warnings
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(window as any).ResizeObserver = ResizeObserver;

// Mock Next/Image to plain img
jest.mock('next/image', () => {
  const MockImage = (props: any) => {
    // Strip Next.js-only props to avoid React DOM warnings in tests
    const rest: any = { ...props }
    delete rest.fill
    delete rest.loader
    delete rest.quality
    delete rest.priority
    delete rest.placeholder
    delete rest.blurDataURL
    return React.createElement('img', { ...rest, alt: props.alt || '' });
  };
  MockImage.displayName = 'MockNextImage';
  return MockImage;
});

// Basic Router mocks (if your component uses them)
jest.mock('next/navigation', () => {
  return {
    useSearchParams: () => new URLSearchParams(),
    useRouter: () => ({
      push: jest.fn(),
      refresh: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
    }),
  };
});

// Mock NextAuth session
jest.mock('next-auth/react', () => ({
  useSession: jest.fn(() => ({
    data: null,
    status: 'unauthenticated'
  })),
}));

// Prevent jsdom navigation noise (Not implemented: navigation except hash changes)
// If location exists, just stub assign/replace; otherwise define minimally
try {
  if (window.location) {
    window.location.assign = jest.fn()
    window.location.replace = jest.fn()
  }
} catch {}

// Polyfill requestIdleCallback for Next.js intersection util in tests
if (!("requestIdleCallback" in window)) {
  // @ts-expect-error define for tests only
  window.requestIdleCallback = (cb: (deadline: number) => void) => setTimeout(() => cb(Date.now()), 1)
}

// Filter only specific, harmless console errors to reduce noise in UI tests
const NAV_ERR = 'Not implemented: navigation (except hash changes)'
const RADIX_TITLE_ERR = '`DialogContent` requires a `DialogTitle`'
const _origConsoleError = console.error
console.error = (...args: any[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : ''
  if (msg.includes(NAV_ERR)) return
  if (msg.includes(RADIX_TITLE_ERR)) return
  _origConsoleError(...args)
}
// Some libs read window.navigation (optional stub)
try {
  if (!('navigation' in window)) {
    Object.defineProperty(window as any, 'navigation', { value: {}, writable: true })
  }
} catch {}
