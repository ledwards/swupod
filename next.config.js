/* global process */
/** @type {import('next').NextConfig} */
const nextConfig = {
  // A production `next build` writes to the same directory `next dev` is serving from, which
  // leaves a running dev server handing out stale/missing chunks (the page renders unstyled).
  // Point build-verification at its own dir instead:
  //   NEXT_DIST_DIR=.next-build npx next build
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.starwarsunlimited.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.swu-db.com',
        pathname: '/images/**',
      },
    ],
    formats: ['image/webp', 'image/avif'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Strict-Transport-Security: tells browsers to always use HTTPS for these hosts.
  // Mitigates the http:// downgrade for users who've visited before (browser
  // auto-upgrades cached HSTS hosts on subsequent visits, including when
  // following redirects that name an http:// Location).
  // Not including `preload` because we haven't committed to the HSTS preload list.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000',
          },
        ],
      },
    ]
  },
  // Apex (protectthepod.com) → www.protectthepod.com 301. The codebase canonicalizes
  // on www (SITE_URL, OG URLs, shared deck links all use https://www.protectthepod.com),
  // so any traffic that lands on the bare apex is normalized via this redirect. Railway
  // serves both hosts (custom domains for apex + www), but the apex's job is to redirect.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'protectthepod.com' }],
        destination: 'https://www.protectthepod.com/:path*',
        permanent: true,
      },
    ]
  },
  // Enable static exports if needed, or remove for SSR
  // output: 'export',
}

export default nextConfig
