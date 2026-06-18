// @ts-nocheck
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from './AuthContext'

// Initialize PostHog only on client and if key exists
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only', // Only create profiles for logged-in users
    capture_pageview: false, // We'll handle this manually for better control
    capture_pageleave: true,
    loaded: (posthog) => {
      if (process.env.NODE_ENV === 'development') {
        // Uncomment to debug in dev:
        // posthog.debug()
      }
    },
  })
  // Segment swupod's events within the shared mega-project (web + iOS + extension + swupod).
  posthog.register({ surface: 'swupod' })
}

/**
 * Tracks page views on route changes
 */
function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (pathname && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      let url = window.origin + pathname
      if (searchParams?.toString()) {
        url = url + '?' + searchParams.toString()
      }
      posthog.capture('$pageview', { $current_url: url })
    }
  }, [pathname, searchParams])

  return null
}

/**
 * Identifies logged-in users to PostHog
 */
function PostHogUserIdentifier() {
  const { user } = useAuth()

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return

    if (user) {
      // Identify on the canonical cross-surface id `discord-<snowflake>` so a
      // person's swupod activity stitches to their web/extension activity in
      // the shared project. Falls back to the internal id for legacy tokens
      // minted before discord_id was added to the session (they re-stitch on
      // next login).
      const distinctId = user.discord_id ? `discord-${user.discord_id}` : user.id
      posthog.identify(distinctId, {
        discord_username: user.discord_username ?? user.username,
        is_admin: user.is_admin,
        is_beta_tester: user.is_beta_tester,
      })
    } else {
      // Reset when logged out
      posthog.reset()
    }
  }, [user])

  return null
}

interface PostHogProviderProps {
  children: React.ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  // If no PostHog key, just render children without tracking
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    return <>{children}</>
  }

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogUserIdentifier />
      {children}
    </PHProvider>
  )
}

// Export posthog instance for manual event tracking
export { posthog }
