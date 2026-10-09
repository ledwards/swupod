// @ts-nocheck
'use client'

/**
 * Client-side providers extracted from app/layout.tsx so the layout
 * itself can be a server component (and export `metadata`). Without
 * this split, the layout couldn't use Next.js's metadata API and the
 * static og:image meta tag rendered on every page — including
 * /pool/[shareId]/deck routes that we want to override with
 * opengraph-image.tsx.
 */

import { AuthProvider } from '../src/contexts/AuthContext'
import { PostHogProvider } from '../src/contexts/PostHogProvider'
import { ToastProvider } from '../src/components/Toast'
import SiteTheme from '../src/components/SiteTheme'
import BetaWelcomeToast from '../src/components/BetaWelcomeToast'
import OpenGameEventToasts from '../src/components/OpenGameEventToasts'

export default function Providers({ children, siteTheme = false }: { children: React.ReactNode; siteTheme?: boolean }) {
  return (
    <AuthProvider>
      <PostHogProvider>
        <ToastProvider>
          <SiteTheme enabled={siteTheme}>
          <BetaWelcomeToast />
          <OpenGameEventToasts />
          {children}
          </SiteTheme>
        </ToastProvider>
      </PostHogProvider>
    </AuthProvider>
  )
}
