/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TypeScript source — let Next transpile them.
  transpilePackages: ['@signalkit/shared', '@signalkit/ui', '@signalkit/i18n'],
  // Standalone output bundles everything needed for a minimal Docker image.
  // Set NEXT_BUILD_MODE=standalone when building inside Docker (Linux).
  // Local Windows builds omit it to avoid EPERM symlink errors.
  output: process.env.NEXT_BUILD_MODE === 'standalone' ? 'standalone' : undefined,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
