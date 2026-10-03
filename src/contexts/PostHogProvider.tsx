// @ts-nocheck
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from './AuthContext'
import { isProductionAnalyticsHost } from '../analytics/productionHost'
import { syncAnalyticsIdentity } from '../analytics/identity'

const trackingEnabled = typeof window !== 'undefined' &&
  isProductionAnalyticsHost(window.location.hostname) && Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY)

if (trackingEnabled) {
  posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
    person_profiles: 'identified_only', // Only create profiles for logged-in users
    capture_pageview: false, // We'll handle this manually for better control
    capture_pageleave: true,
  })
  // Segment swupod's events within the shared mega-project (web + iOS + extension + swupod).
  posthog.register({ surface: 'swupod', environment: 'production' })
}

/**
 * Tracks page views on route changes
 */
function PostHogPageView() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (pathname && trackingEnabled) {
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
  const { user, loading } = useAuth()

  useEffect(() => {
    if (trackingEnabled) syncAnalyticsIdentity(posthog, user, loading)
  }, [user, loading])

  return null
}

interface PostHogProviderProps {
  children: React.ReactNode
}

export function PostHogProvider({ children }: PostHogProviderProps) {
  // If no PostHog key, just render children without tracking
  if (!trackingEnabled) {
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
