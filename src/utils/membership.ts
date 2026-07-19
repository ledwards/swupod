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
// Summary-backed (NOT cardData) — membership is imported by many client
// components; a cardData import here would drag the 8 MB cards.json into
// nearly every client bundle (U5, foundations hardening).
import { hasRealCardsForSet } from './cardSummary'

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
export const PROMO_BANNER_WEEKS_BEFORE_PRERELEASE = 8

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
 * Single gate for whether upcoming-set surfaces (set-picker teaser, homepage
 * promo banner, pod banner, catalog visibility) should be visible. Hits live
 * data — returns true once at least one real card has been synced for the
 * set, false until then. Centralized so it's one stub point for dev preview
 * or tests instead of four scattered call sites.
 */
export function hasUpcomingSetSpoilers(setCode: string): boolean {
  return hasRealCardsForSet(setCode)
}

/**
 * Returns true when the given set has not yet been released AND at least
 * one real (non-placeholder) card has been synced. Gated on real-card
 * existence so the conversion surfaces (set-picker teaser, homepage
 * banner, pod banner) all silently turn off until ASH's first real card
 * lands — and light up automatically the moment it does.
 *
 * Accepts either a set code (string) or a SetConfig object. Unknown set
 * codes return false.
 */
export function isSetUpcoming(
  setCodeOrConfig: string | SetConfig | null | undefined,
  /** Injectable clock so callers/tests aren't at the mercy of the real date. */
  now: Date = new Date(),
): boolean {
  if (!setCodeOrConfig) return false
  const config: SetConfig | null = typeof setCodeOrConfig === 'string'
    ? getSetConfig(setCodeOrConfig.replace('-CB', ''))
    : setCodeOrConfig
  if (!config?.releaseDate) return false
  const beforeRelease = now.toISOString() < new Date(config.releaseDate + 'T00:00:00Z').toISOString()
  if (!beforeRelease) return false
  return hasUpcomingSetSpoilers(config.setCode)
}

/**
 * Pick the next unreleased set for the set-picker "Coming Soon" teaser.
 *
 * Sources from src/utils/setConfigs/ (not src/utils/api.ts's knownSets).
 * Gated on `hasRealCardsForSet` so the teaser only appears once at least
 * one real card has been synced — aligns the marketing surface with
 * actual content availability. Returns null until then.
 *
 * Returns the set with the smallest prereleaseDate strictly greater than
 * now, excluding Carbonite sibling codes.
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
    if (!hasUpcomingSetSpoilers(config.setCode)) continue
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
    if (!hasUpcomingSetSpoilers(config.setCode)) continue
    if (!best || release < new Date(best.releaseDate + 'T00:00:00Z').toISOString()) {
      best = config
    }
  }
  return best
}

