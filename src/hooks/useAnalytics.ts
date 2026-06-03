// @ts-nocheck
import { posthog } from '../contexts/PostHogProvider'

/**
 * Analytics event tracking hook.
 *
 * Usage:
 *   const { track } = useAnalytics()
 *   track('sealed_pool_created', { set: 'LAW', packs: 6 })
 *
 * PostHog automatically captures:
 *   - $device_type (Mobile, Desktop, Tablet)
 *   - $browser (Chrome, Safari, Firefox, etc.)
 *   - $os (iOS, Android, Windows, macOS, etc.)
 *   - $screen_width, $screen_height
 *   - $referrer, $referring_domain
 *   - $current_url
 */
export function useAnalytics() {
  const track = (event: string, properties?: Record<string, unknown>) => {
    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.capture(event, properties)
    }
  }

  return { track }
}

/**
 * Standalone track function for use outside React components.
 * Useful in API routes, utilities, callbacks, etc.
 */
export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    posthog.capture(event, properties)
  }
}

/**
 * Common event names for consistency.
 * Use these with the track() function.
 */
export const AnalyticsEvents = {
  // Pool/Draft lifecycle
  SEALED_POOL_CREATED: 'sealed_pool_created',
  SEALED_POOL_VIEWED: 'sealed_pool_viewed',
  DRAFT_CREATED: 'draft_created',
  DRAFT_JOINED: 'draft_joined',
  DRAFT_STARTED: 'draft_started',
  DRAFT_COMPLETED: 'draft_completed',

  // Deck building
  DECK_BUILDER_OPENED: 'deck_builder_opened',
  DECK_BUILDER_VIEW_CHANGED: 'deck_builder_view_changed',
  DECK_EXPORTED_JSON: 'deck_exported_json',
  DECK_COPIED_JSON: 'deck_copied_json',
  DECK_IMAGE_GENERATED: 'deck_image_generated',
  POOL_IMAGE_GENERATED: 'pool_image_generated',

  // Other formats
  CHAOS_SEALED_CREATED: 'chaos_sealed_created',
  CHAOS_DRAFT_CREATED: 'chaos_draft_created',
  PACK_WARS_CREATED: 'pack_wars_created',
  ROTISSERIE_CREATED: 'rotisserie_created',
  PACK_BLITZ_CREATED: 'pack_blitz_created',

  // Features
  PACKS_SHUFFLED: 'packs_shuffled',
  STARTER_LEADERS_ADDED: 'starter_leaders_added',
  PACKS_OPENED: 'packs_opened',

  // Auth
  USER_SIGNED_IN: 'user_signed_in',
  USER_SIGNED_OUT: 'user_signed_out',
  BETA_ENROLLED: 'beta_enrolled',

  // Membership conversion (U7 — 2026 price-raise experiment)
  // Payload: { surface: 'setPreview' | 'homepageBanner' | 'podBanner', setCode?: string }
  SUBSCRIBE_CTA_SHOWN: 'subscribe_cta_shown',
  SUBSCRIBE_CTA_CLICKED: 'subscribe_cta_clicked',
} as const
