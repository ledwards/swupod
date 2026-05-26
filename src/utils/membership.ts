// @ts-nocheck
/**
 * Membership pricing + upcoming-set helpers — single source of truth.
 *
 * All sub-CTA copy, set-picker teasers, homepage banners, and pod banners
 * read pricing and "is this set upcoming?" data from here. Changing prices
 * or window thresholds happens in this file alone.
 *
 * See docs/plans/2026-05-26-001-feat-patreon-pricing-and-sub-gating-plan.md
 * for the broader rationale (U0–U7).
 */

import { SET_CONFIGS, getSetConfig } from './setConfigs/index'
import type { SetConfig } from './setConfigs/index'

// ---------- Pricing constants ----------

/** Monthly membership price in USD. Source of truth for all on-site copy. */
export const MEMBERSHIP_PRICE_MONTHLY_USD = 9

/**
 * Annual membership price in USD. Null until Patreon eligibility unlocks
 * annual billing ($200/mo × 3 months + charge-upfront tier). When set,
 * formatMembershipPrice() automatically widens to "$9/month or $60/year".
 */
export const MEMBERSHIP_PRICE_ANNUAL_USD: number | null = null

/** Canonical Patreon page URL. */
export const PATREON_URL = 'https://patreon.com/ProtectthePod'

/** Beta-enrollment page (for patrons-without-beta CTA branch). */
export const BETA_ENROLL_URL = '/beta'

// ---------- Promo / banner timing ----------

/**
 * Homepage promo banner shows for the next upcoming set when its
 * prereleaseDate is within this many weeks of "now". After the prerelease
 * window opens the homepage banner still shows; it disappears only when
 * releaseDate <= now.
 */
export const PROMO_BANNER_WEEKS_BEFORE_PRERELEASE = 6

/**
 * Lock-in-window banner end date (ISO 8601 UTC string). Set by U1 scheduling
 * to enable the transient lock-in banner during the 5–7 days before the price
 * raise effective date. Null = no active lock-in window (banner hidden).
 */
export const LOCK_IN_WINDOW_END_DATE: string | null = null

// ---------- Helpers ----------

/**
 * Returns the user-facing price string. Adapts automatically when annual
 * billing ships — no copy churn at rollout.
 */
export function formatMembershipPrice(): string {
  const monthly = `$${MEMBERSHIP_PRICE_MONTHLY_USD}/month`
  if (MEMBERSHIP_PRICE_ANNUAL_USD == null) return monthly
  return `${monthly} or $${MEMBERSHIP_PRICE_ANNUAL_USD}/year`
}

/**
 * Returns true when the given set has not yet been released — used by the
 * pod-marketing banner (U6) and as the unified upcoming-set predicate
 * across all three conversion surfaces.
 *
 * Accepts either a set code (string) or a SetConfig object. Unknown set
 * codes return false.
 */
export function isSetUpcoming(setCodeOrConfig: string | SetConfig | null | undefined): boolean {
  if (!setCodeOrConfig) return false
  const config: SetConfig | null = typeof setCodeOrConfig === 'string'
    ? getSetConfig(setCodeOrConfig.replace('-CB', ''))
    : setCodeOrConfig
  if (!config?.releaseDate) return false
  return new Date().toISOString() < new Date(config.releaseDate + 'T00:00:00Z').toISOString()
}

/**
 * Pick the next unreleased set for the set-picker "Coming Soon" teaser.
 *
 * Sources from src/utils/setConfigs/ (not src/utils/api.ts's knownSets) so
 * the teaser bypasses isSetVisibleInCatalog's hasRealCardsForSet gate.
 * Returns the set with the smallest prereleaseDate strictly greater than
 * now, excluding Carbonite sibling codes. Returns null when nothing is
 * upcoming.
 */
export function getUpcomingSetForPeek(now: Date = new Date()): SetConfig | null {
  const nowIso = now.toISOString()
  let best: SetConfig | null = null
  for (const code in SET_CONFIGS) {
    if (code.endsWith('-CB')) continue
    const config = SET_CONFIGS[code]
    if (!config.prereleaseDate) continue
    const pre = new Date(config.prereleaseDate + 'T00:00:00Z').toISOString()
    if (pre <= nowIso) continue
    if (!best || pre < new Date(best.prereleaseDate + 'T00:00:00Z').toISOString()) {
      best = config
    }
  }
  return best
}

/**
 * Pick the next upcoming set for the homepage promo banner.
 *
 * Returns the next set whose releaseDate > now AND whose prereleaseDate is
 * within PROMO_BANNER_WEEKS_BEFORE_PRERELEASE weeks of now. When no set
 * matches, returns null (banner hidden).
 *
 * Distinct from getUpcomingSetForPeek: this widens the window to "near
 * prerelease" so we promote during the ramp-up; the picker teaser only
 * shows strictly-pre-prerelease sets.
 */
export function getUpcomingSetForPromo(now: Date = new Date()): SetConfig | null {
  const nowIso = now.toISOString()
  const windowMs = PROMO_BANNER_WEEKS_BEFORE_PRERELEASE * 7 * 24 * 60 * 60 * 1000
  let best: SetConfig | null = null
  for (const code in SET_CONFIGS) {
    if (code.endsWith('-CB')) continue
    const config = SET_CONFIGS[code]
    if (!config.prereleaseDate || !config.releaseDate) continue
    const release = new Date(config.releaseDate + 'T00:00:00Z').toISOString()
    if (release <= nowIso) continue
    const preMs = new Date(config.prereleaseDate + 'T00:00:00Z').getTime()
    if (preMs - now.getTime() > windowMs) continue
    if (!best || release < new Date(best.releaseDate + 'T00:00:00Z').toISOString()) {
      best = config
    }
  }
  return best
}

/**
 * Returns true when "now" falls before the lock-in window end date.
 * Used by U5's lock-in banner variant to show "Lock in $5/month before
 * {date}" during the announcement window.
 */
export function isWithinLockInWindow(now: Date = new Date()): boolean {
  if (!LOCK_IN_WINDOW_END_DATE) return false
  return now.toISOString() < LOCK_IN_WINDOW_END_DATE
}
