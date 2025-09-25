/* eslint-disable @typescript-eslint/no-explicit-any */
import '@testing-library/jest-dom';
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
    return React.createElement('img', { ...props, alt: props.alt || '' });
  };
  MockImage.displayName = 'MockNextImage';
  return MockImage;
});

// Basic Router mocks (if your component uses them)
jest.mock('next/navigation', () => {
  return {
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