/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TypeScript source — let Next transpile them.
  transpilePackages: ['@signalkit/shared', '@signalkit/ui', '@signalkit/i18n'],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
