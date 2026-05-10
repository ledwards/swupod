/**
 * Server-side layout for /pool/[shareId]/deck and /pool/[shareId]/deck/[buildId].
 *
 * Sole purpose: set metadataBase so Next.js's auto-generated og:image
 * URL (from opengraph-image.tsx in this segment) resolves to the public
 * production hostname instead of the container's internal localhost:8080.
 *
 * Without this, social-card crawlers fetch
 *   http://localhost:8080/pool/.../deck/opengraph-image
 * which obviously 404s — the meta is right but the URL is wrong.
 *
 * Root app/layout.tsx is currently a client component, so it can't
 * export metadata; this nested server layout is the smallest fix.
 */

import type { Metadata } from 'next'

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.APP_URL ||
      'https://www.protectthepod.com',
  ),
}

export default function PoolDeckLayout({ children }: { children: React.ReactNode }) {
  return children
}
