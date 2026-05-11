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
import AuthWidget from '../src/components/AuthWidget'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <PostHogProvider>
        <AuthWidget />
        {children}
      </PostHogProvider>
    </AuthProvider>
  )
}
