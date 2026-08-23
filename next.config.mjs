/** @type {import('next').NextConfig} */
import reticleNext from '@reticlehq/next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig = {
  // Hide x-powered-by header for security
  poweredByHeader: false,

  // Compress responses with gzip
  compress: true,

  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [375, 640, 750, 1080, 1200, 1920],
    // Cache remote images for 60 days on CDN
    minimumCacheTTL: 60 * 60 * 24 * 60,
  },

  // React strict mode for development
  reactStrictMode: true,

  // Standalone output — required by Dockerfile.prod runner stage
  // (copies /app/.next/standalone); without it docker builds fail with
  // "/app/.next/standalone: not found".
  output: 'standalone',

  // Production source maps (hidden in prod, available for error tracking)
  productionBrowserSourceMaps: false,

  // Prevent OOM kills on Vercel free tier during static generation
  // by reducing concurrency and memory pressure. cpus caps the number of
  // page-data collection workers (defaults to host core count - 1).
  experimental: {
    cpus: 2,
    // Tell Turbopack to reduce memory usage during build
    optimizePackageImports: ['lucide-react', 'framer-motion', '@radix-ui/*', 'recharts', 'date-fns', 'cmdk'],
    // DISABLED optimizeServerReact: it splits client components into a
    // separate server-render chunk graph, and on Vercel the landing-page
    // island (PortalShell -> PortalClient) never flushed its SSR HTML —
    // the deployment served a thin 35KB shell (empty Suspense boundary)
    // vs the full 204KB SSR locally. The island then hydrated against an
    // empty server fragment and React threw #418 on every prod landing
    // visit. Disabling restores the standard server chunk graph.
    // (Vercel prod ISR still had the abort behavior, so prerenderEarlyExit
    // is also pinned off below.)
    // prerenderEarlyExit: false stops Next from finalizing a prerender as
    // soon as the shell is complete — with it true, a boundary still
    // pending at shell-finish (the island) was dropped from the cached
    // HTML, which is exactly the thin-shell -> #418 chain above.
    prerenderEarlyExit: false,
  },

  // External packages that shouldn't be traced/bundled (fixes NFT warnings)
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'speakeasy', 'qrcode'],

  // Headers for performance and security
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },

      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      // Cache static assets aggressively (fonts, images, JS chunks with hash)
      {
        source: '/:path*.(svg|png|jpg|jpeg|gif|webp|avif|ico)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*.(js|css)',
        headers: [
          // ponytail: Next.js content-hashes JS/CSS filenames, so long cache
          // is safe — but Turbopack sometimes keeps the same filename across
          // deploys when only class names change. Use revalidate so the
          // browser always checks with the server for freshness.
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/:path*.(woff|woff2|ttf|otf|eot)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      {
        source: '/:path*.(json)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400' },
        ],
      },
      // ponytail: DO NOT add a _next/static catch-all here — it overrides
      // the extension-based .js/.css rules above. The extension rules set
      // max-age=0, must-revalidate which forces the browser to always
      // check freshness. The catch-all was setting max-age=3600 which
      // let the browser serve stale assets for up to an hour.
    ];
  },
};

// Reticle (dev-only runtime verification): wraps next config for source
// mapping (file:line evidence). No-op in production builds.
// withSentryConfig wires the Sentry SDK + source map upload (no-op in builds
// without SENTRY_DSN / SENTRY_AUTH_TOKEN; silent avoids noisy build logs).
export default withSentryConfig(
  reticleNext.withReticle(nextConfig),
  {
    silent: true,
    hideSourceMaps: false,
    disableLogger: true,
    telemetry: false,
  }
);
