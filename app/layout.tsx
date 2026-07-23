// @ts-nocheck
/**
 * Root layout (server component). Exports metadata via Next.js's metadata
 * API instead of hardcoding <meta> tags in JSX, so nested segments can
 * override openGraph.images via opengraph-image.tsx — without this,
 * the static og:image meta stays in <head> alongside the dynamic one
 * and crawlers show both (Discord renders two images in the preview).
 *
 * Client logic (AuthProvider, PostHogProvider, AuthWidget) lives in
 * app/providers.tsx so this file can stay server-only.
 */

import type { Metadata, Viewport } from 'next'
import Providers from './providers'
import '../src/styles/tokens.css'
import '../src/index.css'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.protectthepod.com'
const TITLE = 'Protect the Pod - Star Wars Unlimited Limited Simulator'
const DESCRIPTION =
  'The fan-made open source Star Wars Unlimited limited format simulator. Draft and build sealed pools with friends, then export to Karabast to play!'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    'Star Wars Unlimited',
    'SWU',
    'draft',
    'sealed',
    'limited',
    'simulator',
    'Karabast',
    'trading card game',
    'TCG',
  ],
  authors: [{ name: 'Protect the Pod' }],
  robots: 'index, follow',
  alternates: { canonical: SITE_URL },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'Protect the Pod',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: TITLE,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: '/og-image.png', alt: TITLE }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Protect the Pod',
  },
  icons: {
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
    ],
  },
  manifest: '/site.webmanifest',
  other: {
    'msapplication-TileColor': '#1a1a2e',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#1a1a2e',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Fonts — these are static link rels Next.js's metadata API
            doesn't have a first-class slot for. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
