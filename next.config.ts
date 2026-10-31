import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { imageRemotePatterns } from './src/config/images';

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_TEST_MODE: process.env.TEST_MODE || process.env.NEXT_PUBLIC_TEST_MODE || '0',
  },
  images: {
    remotePatterns: imageRemotePatterns,
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
});
