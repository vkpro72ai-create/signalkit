/** @type {import('next').NextConfig} */

const mode = process.env.NEXT_BUILD_MODE; // 'standalone' | 'export' | undefined

const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are TypeScript source — let Next transpile them.
  transpilePackages: ['@signalkit/shared', '@signalkit/ui', '@signalkit/i18n'],
  // standalone → Docker image; export → GitHub Pages static site; undefined → local dev
  output: mode === 'standalone' ? 'standalone' : mode === 'export' ? 'export' : undefined,
  // GitHub Pages serves from /signalkit sub-path
  basePath: mode === 'export' ? '/signalkit' : undefined,
  assetPrefix: mode === 'export' ? '/signalkit/' : undefined,
  trailingSlash: mode === 'export' ? true : undefined,
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
