/** @type {import('next').NextConfig} */
const nextConfig = {
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
  // Strict-Transport-Security: tells browsers to always use HTTPS for this host.
  // Mitigates the http:// downgrade for users who've visited before (browser
  // auto-upgrades cached HSTS hosts on subsequent visits, including when
  // following redirects that name an http:// Location).
  // Not including `includeSubDomains` because the apex isn't on Railway yet;
  // not including `preload` because we haven't committed to the HSTS preload list.
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
  // Enable static exports if needed, or remove for SSR
  // output: 'export',
}

export default nextConfig
